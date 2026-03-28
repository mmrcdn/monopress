/**
 * @fileoverview Monopress application logic using Vue 3 Composition API.
 * Updated to match the new i18n schema.
 * @version 1.2.1
 */

marked.setOptions({ gfm: true, breaks: false });

const renderer = new marked.Renderer();
renderer.heading = function (text, level) {
    const headingText = typeof text === 'string' ? text : text.text;
    const headingLevel = typeof text === 'string' ? level : text.depth;
    const escapedText = encodeURIComponent(headingText.replace(/<[^>]*>?/gm, '').trim());
    return `<h${headingLevel} id="${escapedText}">${headingText}</h${headingLevel}>\n`;
};
marked.use({ renderer: renderer });

const DEFAULT_STYLESHEET_URL = 'https://mmrcdn.github.io/monopress/ui@markdown.css';
const LOCAL_STORAGE_THEME_KEY = 'monopress-theme-preference';
const LOCAL_STORAGE_LANG_KEY = 'monopress-lang-preference';

const { createApp, ref, computed, watch, onMounted, onUnmounted } = Vue;
const { createI18n, useI18n } = VueI18n;

const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: {
        en: window.MonopressDefaultLangs || {},
    },
});

createApp({
    setup() {
        const { t, locale, setLocaleMessage, availableLocales } = useI18n();

        const VERSION = ref('1.2.2');
        const uploadedFiles = ref([]);
        const selectedFileId = ref(null);
        const isDragOverDropzone = ref(false);
        const isSidebarOpen = ref(true);
        const activeViewerTab = ref('preview');
        const isSourceCopied = ref(false);
        const isDownloadMenuOpen = ref(false);
        const downloadMenuRef = ref(null);
        const previewIframeRef = ref(null);
        const currentLocale = ref('en');
        const isLangMenuOpen = ref(false);
        const langMenuRef = ref(null);
        const locales = ref({ en: 'English', ko: '한국어', ja: '日本語', zh: '中文' });

        const globalSettings = ref({ stylesheetUrl: '' });
        const currentTheme = ref(localStorage.getItem(LOCAL_STORAGE_THEME_KEY) || 'system');
        const systemDarkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const toastNotification = ref({ message: '', type: 'success', isVisible: false });
        let dragEventCounter = 0;

        // ==========================================
        // Computed Properties
        // ==========================================

        const hasUploadedFiles = computed(() => !_.isEmpty(uploadedFiles.value));
        const selectedFile = computed(() => _.find(uploadedFiles.value, ['id', selectedFileId.value]));
        const rawMarkdownContent = computed(() => _.get(selectedFile.value, 'rawMarkdownContent', ''));
        const generatedHtmlContent = computed(() => _.get(selectedFile.value, 'generatedHtmlContent', ''));

        const dropzoneTitleText = computed(() => {
            return hasUploadedFiles.value ? t('dropzone.loaded', { count: uploadedFiles.value.length }) : t('dropzone.select');
        });

        const copyButtonText = computed(() => (isSourceCopied.value ? t('common.copied') : t('common.copy')));
        const currentLocaleName = computed(() => locales.value[currentLocale.value] || 'English');

        // ==========================================
        // Methods
        // ==========================================

        const showToastNotification = (message, type = 'success') => {
            toastNotification.value = { message, type, isVisible: true };
            _.delay(() => {
                toastNotification.value.isVisible = false;
            }, 2800);
        };

        const generateHtmlFromMarkdown = (fileItem) => {
            if (!fileItem.rawMarkdownContent) return;
            fileItem.conversionStatus = 'processing';

            try {
                const appliedStylesheetUrl = _.trim(globalSettings.value.stylesheetUrl) || DEFAULT_STYLESHEET_URL;
                const parsedBodyHtml = marked.parse(fileItem.rawMarkdownContent);

                const htmlSkeleton = [
                    '<!doctype html><html><head>',
                    `        <title>${_.escape(fileItem.displayTitle)}</title>`,
                    `        <meta http-equiv="Content-type" content="text/html;charset=UTF-8" />`,
                    `        <link rel="stylesheet" href="${_.escape(appliedStylesheetUrl)}" />`,
                    '    </head><body>',
                    parsedBodyHtml,
                    '    </body></html>',
                ].join('\n');

                fileItem.generatedHtmlContent = html_beautify(htmlSkeleton, {
                    indent_size: 4,
                    indent_char: ' ',
                    max_preserve_newlines: 1,
                    preserve_newlines: true,
                    indent_inner_html: false,
                    wrap_line_length: 0,
                    end_with_newline: false,
                    extra_liners: ['head', 'body', '/html'],
                });

                fileItem.conversionStatus = 'done';
            } catch (error) {
                fileItem.conversionStatus = 'error';
                showToastNotification(t('toast.htmlError', { name: fileItem.displayTitle }), 'error');
            }
        };

        const readAndConvertFile = (fileItem) => {
            fileItem.conversionStatus = 'processing';
            const fileReader = new FileReader();
            fileReader.onload = (event) => {
                fileItem.rawMarkdownContent = event.target.result;
                generateHtmlFromMarkdown(fileItem);
            };
            fileReader.onerror = () => {
                fileItem.conversionStatus = 'error';
                showToastNotification(t('toast.readError', { name: fileItem.displayTitle }), 'error');
            };
            fileReader.readAsText(fileItem.originalFile, 'UTF-8');
        };

        const processIncomingFiles = (targetFiles) => {
            if (_.isEmpty(targetFiles)) return;
            let successfulLoadCount = 0;

            _.forEach(targetFiles, (selectedFile) => {
                const isValidMarkdownFile = _.endsWith(selectedFile.name, '.md') || selectedFile.type === 'text/markdown' || selectedFile.type === 'text/plain';
                if (isValidMarkdownFile) {
                    const uniqueId = _.uniqueId('file_') + '_' + Date.now().toString(36);
                    const newFileItem = {
                        id: uniqueId,
                        originalFile: selectedFile,
                        displayTitle: selectedFile.name.trim(),
                        rawMarkdownContent: '',
                        generatedHtmlContent: '',
                        conversionStatus: 'idle',
                    };
                    uploadedFiles.value.push(newFileItem);
                    successfulLoadCount++;
                    if (!selectedFileId.value) selectedFileId.value = uniqueId;
                    readAndConvertFile(_.last(uploadedFiles.value));
                }
            });

            if (successfulLoadCount > 0) {
                showToastNotification(t('toast.filesLoaded', { count: successfulLoadCount }), 'success');
                if (window.innerWidth < 1024) isSidebarOpen.value = false;
            } else {
                showToastNotification(t('toast.unsupported'), 'error');
            }
        };

        const handleFileInputChange = (event) => processIncomingFiles(_.get(event, 'target.files'));

        const clearAllUploadedFiles = () => {
            uploadedFiles.value = [];
            selectedFileId.value = null;
            showToastNotification(t('toast.cleared'), 'info');
        };

        const executeDownload = async (type) => {
            isDownloadMenuOpen.value = false;
            if (type === 'pdf') await downloadSinglePdfFile();
            else if (type === 'webp') await downloadSingleWebpFile();
            else if (type === 'html') downloadSingleHtmlFile();
        };

        const downloadSingleHtmlFile = () => {
            if (!selectedFile.value || !generatedHtmlContent.value) return;
            const targetFileName = selectedFile.value.displayTitle + '.html';
            const blob = new Blob([generatedHtmlContent.value], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = targetFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToastNotification(t('toast.downloaded', { name: targetFileName }), 'success');
        };

        const downloadSinglePdfFile = async () => {
            if (!selectedFile.value || !generatedHtmlContent.value) return;
            if (_.isUndefined(window.html2pdf)) {
                showToastNotification(t('toast.pdfMissing'), 'error');
                return;
            }
            showToastNotification(t('toast.pdfStart'), 'info');
            try {
                const iframeDocument = _.get(previewIframeRef.value, 'contentDocument');
                const fileName = `${selectedFile.value.displayTitle}.pdf`;
                const options = {
                    margin: [10, 10, 10, 10],
                    filename: fileName,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, backgroundColor: currentTheme.value === 'dark' ? '#101014' : '#ffffff' },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                };
                await html2pdf().set(options).from(iframeDocument.body).save();
                showToastNotification(t('toast.downloaded', { name: fileName }), 'success');
            } catch (e) {
                showToastNotification(t('toast.pdfFail'), 'error');
            }
        };

        const downloadSingleWebpFile = async () => {
            if (!selectedFile.value || !generatedHtmlContent.value) return;
            if (_.isUndefined(window.html2canvas)) {
                showToastNotification(t('toast.webpMissing'), 'error');
                return;
            }
            showToastNotification(t('toast.webpStart'), 'info');
            try {
                const iframeDocument = _.get(previewIframeRef.value, 'contentDocument');
                const element = iframeDocument.documentElement;
                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    windowWidth: element.scrollWidth,
                    windowHeight: element.scrollHeight,
                    backgroundColor: currentTheme.value === 'dark' ? '#101014' : '#ffffff',
                });
                const dataUrl = canvas.toDataURL('image/webp', 0.95);
                const fileName = `${selectedFile.value.displayTitle}.webp`;
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                _.delay(() => document.body.removeChild(a), 100);
                showToastNotification(t('toast.downloaded', { name: fileName }), 'success');
            } catch (e) {
                showToastNotification(t('toast.webpFail'), 'error');
            }
        };

        const downloadAllFilesAsZip = async () => {
            if (!hasUploadedFiles.value) return;
            if (_.isUndefined(window.JSZip)) {
                showToastNotification(t('toast.zipMissing'), 'error');
                return;
            }
            showToastNotification(t('toast.zipStart'), 'info');
            const zip = new JSZip();
            let count = 0;
            _.forEach(uploadedFiles.value, (file) => {
                if (file.conversionStatus === 'done' && file.generatedHtmlContent) {
                    zip.file(`${file.displayTitle}.html`, file.generatedHtmlContent);
                    count++;
                }
            });
            if (count === 0) {
                showToastNotification(t('toast.zipEmpty'), 'warning');
                return;
            }
            try {
                const content = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = t('export.zipName');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToastNotification(t('toast.zipSuccess', { count }));
            } catch (e) {
                showToastNotification(t('toast.zipError', { msg: e.message }), 'error');
            }
        };

        const copyHtmlSourceToClipboard = () => {
            if (!generatedHtmlContent.value) return;
            navigator.clipboard.writeText(generatedHtmlContent.value).then(() => {
                isSourceCopied.value = true;
                showToastNotification(t('toast.copied'), 'success');
                _.delay(() => {
                    isSourceCopied.value = false;
                }, 2000);
            });
        };

        const changeApplicationTheme = (theme) => {
            currentTheme.value = theme;
            localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
            const resolved = theme === 'system' ? (systemDarkModeQuery.matches ? 'dark' : 'light') : theme;
            document.documentElement.setAttribute('data-theme', resolved);
        };

        const loadLanguageAsync = async (lang) => {
            if (availableLocales.includes(lang)) {
                locale.value = lang;
                currentLocale.value = lang;
                return;
            }
            try {
                const res = await fetch(`./assets/langs/${lang}.json`);
                const messages = await res.json();
                setLocaleMessage(lang, messages);
                locale.value = lang;
                currentLocale.value = lang;
                localStorage.setItem(LOCAL_STORAGE_LANG_KEY, lang);
            } catch (e) {
                showToastNotification(t('toast.cors'), 'warning');
                locale.value = 'en';
                currentLocale.value = 'en';
            }
        };

        const selectLocale = (lang) => {
            loadLanguageAsync(lang);
            isLangMenuOpen.value = false;
        };
        const toggleSidebarVisibility = () => {
            isSidebarOpen.value = !isSidebarOpen.value;
        };
        const toggleDownloadMenu = () => {
            isDownloadMenuOpen.value = !isDownloadMenuOpen.value;
            if (isDownloadMenuOpen.value) isLangMenuOpen.value = false;
        };
        const toggleLangMenu = () => {
            isLangMenuOpen.value = !isLangMenuOpen.value;
            if (isLangMenuOpen.value) isDownloadMenuOpen.value = false;
        };
        const formatFileByteSize = (b) => {
            if (b === 0) return '0 B';
            const k = 1024;
            const s = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(b) / Math.log(k));
            return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
        };
        const removeFileFromStack = (id) => {
            const idx = _.findIndex(uploadedFiles.value, ['id', id]);
            if (idx > -1) {
                _.pullAt(uploadedFiles.value, idx);
                if (selectedFileId.value === id) {
                    if (!_.isEmpty(uploadedFiles.value)) {
                        selectedFileId.value = _.get(uploadedFiles.value, `[${Math.min(idx, uploadedFiles.value.length - 1)}].id`);
                    } else {
                        selectedFileId.value = null;
                    }
                }
            }
        };

        onMounted(() => {
            changeApplicationTheme(currentTheme.value);
            loadLanguageAsync(localStorage.getItem(LOCAL_STORAGE_LANG_KEY) || 'en');
            window.addEventListener('drop', (e) => {
                e.preventDefault();
                isDragOverDropzone.value = false;
                processIncomingFiles(_.get(e, 'dataTransfer.files'));
            });
            window.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            window.addEventListener('dragenter', (e) => {
                e.preventDefault();
                isDragOverDropzone.value = true;
                dragEventCounter++;
            });
            window.addEventListener('dragleave', (e) => {
                e.preventDefault();
                dragEventCounter--;
                if (dragEventCounter === 0) isDragOverDropzone.value = false;
            });
            document.addEventListener('click', (e) => {
                if (isDownloadMenuOpen.value && downloadMenuRef.value && !downloadMenuRef.value.contains(e.target)) isDownloadMenuOpen.value = false;
                if (isLangMenuOpen.value && langMenuRef.value && !langMenuRef.value.contains(e.target)) isLangMenuOpen.value = false;
            });
        });

        return {
            VERSION,
            uploadedFiles,
            selectedFileId,
            isDragOverDropzone,
            isSidebarOpen,
            activeViewerTab,
            globalSettings,
            currentTheme,
            previewIframeRef,
            toastNotification,
            isDownloadMenuOpen,
            downloadMenuRef,
            isLangMenuOpen,
            langMenuRef,
            locales,
            currentLocale,
            currentLocaleName,
            t,
            selectedFile,
            rawMarkdownContent,
            generatedHtmlContent,
            hasUploadedFiles,
            dropzoneTitleText,
            copyButtonText,
            selectLocale,
            toggleSidebarVisibility,
            toggleDownloadMenu,
            toggleLangMenu,
            executeDownload,
            formatFileByteSize,
            handleFileInputChange,
            removeFileFromStack,
            clearAllUploadedFiles,
            downloadAllFilesAsZip,
            copyHtmlSourceToClipboard,
            changeApplicationTheme,
            isSourceCopied,
            printHtmlPreview: () => {
                const win = _.get(previewIframeRef.value, 'contentWindow');
                if (win) {
                    win.focus();
                    win.print();
                }
            },
        };
    },
})
    .use(i18n)
    .mount('#app');
