/**
 * @fileoverview Monopress application logic using Vue 3 Composition API, Vue-i18n & Lodash.
 * @version 1.2.0
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

// Initialize empty i18n instance. Default is English.
const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: {
        en: window.MonopressDefaultLangs || {},
    },
});

createApp({
    /**
     * Setup composition logic for the application.
     * @returns {Object} Reactive variables and functions exposed to the template.
     */
    setup() {
        const { t, locale, setLocaleMessage, availableLocales } = useI18n();

        const VERSION = ref('1.2.0');
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

        // Language Dropdown States
        const isLangMenuOpen = ref(false);
        const langMenuRef = ref(null);

        const globalSettings = ref({
            stylesheetUrl: '',
        });

        const currentTheme = ref(localStorage.getItem(LOCAL_STORAGE_THEME_KEY) || 'system');
        const systemDarkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const toastNotification = ref({
            message: '',
            type: 'success',
            isVisible: false,
        });

        let dragEventCounter = 0;

        const localeNames = {
            en: 'English',
            ko: '한국어',
            ja: '日本語',
            zh: '中文',
        };

        // ==========================================
        // Computed Properties
        // ==========================================

        const hasUploadedFiles = computed(() => !_.isEmpty(uploadedFiles.value));
        const selectedFile = computed(() => _.find(uploadedFiles.value, ['id', selectedFileId.value]));
        const rawMarkdownContent = computed(() => _.get(selectedFile.value, 'rawMarkdownContent', ''));
        const generatedHtmlContent = computed(() => _.get(selectedFile.value, 'generatedHtmlContent', ''));

        const dropzoneTitleText = computed(() => {
            return hasUploadedFiles.value ? t('dropzone.filesLoaded', { count: uploadedFiles.value.length }) : t('dropzone.selectFiles');
        });

        const copyButtonText = computed(() => (isSourceCopied.value ? t('common.copied') : t('common.copy')));

        const currentLocaleName = computed(() => localeNames[currentLocale.value] || 'English');

        // ==========================================
        // i18n Logic (Lazy Loading)
        // ==========================================

        /**
         * Dynamically loads a language pack from the server.
         * @param {string} lang The target locale code (en, ko, ja, zh).
         * @returns {Promise<void>}
         */
        const loadLanguageAsync = async (lang) => {
            if (availableLocales.includes(lang)) {
                locale.value = lang;
                currentLocale.value = lang;
                return;
            }

            try {
                const response = await fetch(`./assets/langs/${lang}.json`);
                if (!response.ok) throw new Error('Locale file not found.');

                const messages = await response.json();
                setLocaleMessage(lang, messages);

                locale.value = lang;
                currentLocale.value = lang;
                localStorage.setItem(LOCAL_STORAGE_LANG_KEY, lang);
            } catch (error) {
                console.warn('CORS Error (Local env). Please run on a web server to load other languages.');
                showToastNotification(t('toast.corsError'), 'warning');

                locale.value = 'en';
                currentLocale.value = 'en';
            }
        };

        /**
         * Triggers language change.
         * @param {string} lang Target locale code.
         * @returns {void}
         */
        const changeLocale = (lang) => {
            loadLanguageAsync(lang);
        };

        // ==========================================
        // Helpers & Methods
        // ==========================================

        const hideToastDebounced = _.debounce(() => {
            toastNotification.value.isVisible = false;
        }, 2800);

        const debouncedReconvertAllFiles = _.debounce(() => {
            if (hasUploadedFiles.value) {
                _.forEach(uploadedFiles.value, (item) => generateHtmlFromMarkdown(item));
            }
        }, 300);

        watch(() => globalSettings.value.stylesheetUrl, debouncedReconvertAllFiles);

        /**
         * Toggles the sidebar visibility.
         * @returns {void}
         */
        const toggleSidebarVisibility = () => {
            isSidebarOpen.value = !isSidebarOpen.value;
        };

        /**
         * Toggles the download dropdown menu.
         * Closes language menu if opened.
         * @returns {void}
         */
        const toggleDownloadMenu = () => {
            isDownloadMenuOpen.value = !isDownloadMenuOpen.value;
            if (isDownloadMenuOpen.value) isLangMenuOpen.value = false;
        };

        /**
         * Toggles the language selection dropdown menu.
         * Closes download menu if opened.
         * @returns {void}
         */
        const toggleLangMenu = () => {
            isLangMenuOpen.value = !isLangMenuOpen.value;
            if (isLangMenuOpen.value) isDownloadMenuOpen.value = false;
        };

        /**
         * Selects a specific locale and closes the language menu.
         * @param {string} lang Target locale code.
         * @returns {void}
         */
        const selectLocale = (lang) => {
            changeLocale(lang);
            isLangMenuOpen.value = false;
        };

        /**
         * Closes active dropdown menus when clicking outside of their references.
         * @param {Event} event The DOM click event.
         * @returns {void}
         */
        const closeDropdownsOnClickOutside = (event) => {
            if (isDownloadMenuOpen.value && downloadMenuRef.value && !downloadMenuRef.value.contains(event.target)) {
                isDownloadMenuOpen.value = false;
            }
            if (isLangMenuOpen.value && langMenuRef.value && !langMenuRef.value.contains(event.target)) {
                isLangMenuOpen.value = false;
            }
        };

        /**
         * Displays a toast notification with a specific message and type.
         * @param {string} message The notification message.
         * @param {string} [type='success'] The notification type (success, warning, error, info).
         * @returns {void}
         */
        const showToastNotification = (message, type = 'success') => {
            toastNotification.value = { message, type, isVisible: true };
            hideToastDebounced();
        };

        /**
         * Formats file size in bytes to a human-readable string.
         * @param {number} bytes The file size in bytes.
         * @returns {string} Formatted size string (e.g., "1.5 MB").
         */
        const formatFileByteSize = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const index = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, index)).toFixed(1)) + ' ' + sizes[index];
        };

        /**
         * Converts raw markdown content to beautified HTML.
         * @param {Object} fileItem The target file item object.
         * @returns {void}
         */
        const generateHtmlFromMarkdown = (fileItem) => {
            if (!fileItem.rawMarkdownContent) return;

            fileItem.conversionStatus = 'converting';

            try {
                const appliedStylesheetUrl = _.trim(globalSettings.value.stylesheetUrl) || DEFAULT_STYLESHEET_URL;
                const parsedBodyHtml = marked.parse(fileItem.rawMarkdownContent);

                const htmlSkeleton = [
                    '<!doctype html>',
                    '<html>',
                    '    <head>',
                    `        <title>${_.escape(fileItem.displayTitle)}</title>`,
                    `        <meta http-equiv="Content-type" content="text/html;charset=UTF-8" />`,
                    `        <link rel="stylesheet" href="${_.escape(appliedStylesheetUrl)}" />`,
                    '    </head>',
                    '    <body>',
                    parsedBodyHtml,
                    '    </body>',
                    '</html>',
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

                fileItem.conversionStatus = 'ready';
            } catch (error) {
                fileItem.conversionStatus = 'error';
                showToastNotification(t('toast.errorGenerateHtml', { name: fileItem.displayTitle }), 'error');
            }
        };

        /**
         * Reads the local file as text and triggers conversion.
         * @param {Object} fileItem The target file item object.
         * @returns {void}
         */
        const readAndConvertFile = (fileItem) => {
            fileItem.conversionStatus = 'converting';
            const fileReader = new FileReader();

            fileReader.onload = (event) => {
                fileItem.rawMarkdownContent = event.target.result;
                generateHtmlFromMarkdown(fileItem);
            };

            fileReader.onerror = () => {
                fileItem.conversionStatus = 'error';
                showToastNotification(t('toast.errorReadFile', { name: fileItem.displayTitle }), 'error');
            };

            fileReader.readAsText(fileItem.originalFile, 'UTF-8');
        };

        /**
         * Processes incoming file objects from input or drop events.
         * @param {FileList|Array} targetFiles The files to process.
         * @returns {void}
         */
        const processIncomingFiles = (targetFiles) => {
            if (_.isEmpty(targetFiles)) return;

            let successfulLoadCount = 0;

            _.forEach(targetFiles, (selectedFile) => {
                const isValidMarkdownFile = _.endsWith(selectedFile.name, '.md') || selectedFile.type === 'text/markdown' || selectedFile.type === 'text/plain';

                if (isValidMarkdownFile) {
                    const uniqueFileId = _.uniqueId('file_') + '_' + Date.now().toString(36);

                    const newFileItem = {
                        id: uniqueFileId,
                        originalFile: selectedFile,
                        displayTitle: selectedFile.name.trim(),
                        rawMarkdownContent: '',
                        generatedHtmlContent: '',
                        conversionStatus: 'idle',
                    };

                    uploadedFiles.value.push(newFileItem);
                    successfulLoadCount++;

                    if (!selectedFileId.value) selectedFileId.value = uniqueFileId;

                    readAndConvertFile(_.last(uploadedFiles.value));
                }
            });

            if (successfulLoadCount > 0) {
                showToastNotification(t('toast.filesLoaded', { count: successfulLoadCount }), 'success');
                if (window.innerWidth < 1024) isSidebarOpen.value = false;
            } else {
                showToastNotification(t('toast.unsupportedFile'), 'error');
            }
        };

        const handleFileInputChange = (event) => processIncomingFiles(_.get(event, 'target.files'));

        /**
         * Removes a specific file from the stack by ID.
         * @param {string} targetId The ID of the file to remove.
         * @returns {void}
         */
        const removeFileFromStack = (targetId) => {
            const fileIndex = _.findIndex(uploadedFiles.value, ['id', targetId]);

            if (fileIndex > -1) {
                _.pullAt(uploadedFiles.value, fileIndex);

                if (selectedFileId.value === targetId) {
                    if (!_.isEmpty(uploadedFiles.value)) {
                        const fallbackIndex = Math.min(fileIndex, uploadedFiles.value.length - 1);
                        selectedFileId.value = _.get(uploadedFiles.value, `[${fallbackIndex}].id`);
                    } else {
                        selectedFileId.value = null;
                        activeViewerTab.value = 'preview';
                    }
                }
            }
        };

        /**
         * Clears all uploaded files from the workspace.
         * @returns {void}
         */
        const clearAllUploadedFiles = () => {
            uploadedFiles.value = [];
            selectedFileId.value = null;
            activeViewerTab.value = 'preview';
            showToastNotification(t('toast.workspaceCleared'), 'info');
        };

        /**
         * Executes the download process based on the requested type.
         * @param {string} type 'pdf', 'webp', or 'html'.
         * @returns {Promise<void>}
         */
        const executeDownload = async (type) => {
            isDownloadMenuOpen.value = false;

            if (type === 'pdf') await downloadSinglePdfFile();
            else if (type === 'webp') await downloadSingleWebpFile();
            else if (type === 'html') downloadSingleHtmlFile();
        };

        const downloadSingleHtmlFile = () => {
            if (!selectedFile.value || !generatedHtmlContent.value) return;

            const targetFileName = selectedFile.value.displayTitle + '.html';
            const htmlBlob = new Blob([generatedHtmlContent.value], { type: 'text/html;charset=utf-8' });
            const temporaryDownloadUrl = URL.createObjectURL(htmlBlob);

            const anchorElement = document.createElement('a');
            anchorElement.href = temporaryDownloadUrl;
            anchorElement.download = targetFileName;

            document.body.appendChild(anchorElement);
            anchorElement.click();
            document.body.removeChild(anchorElement);

            URL.revokeObjectURL(temporaryDownloadUrl);
            showToastNotification(t('toast.fileDownloaded', { name: targetFileName }), 'success');
        };

        const downloadSinglePdfFile = async () => {
            if (!selectedFile.value || !generatedHtmlContent.value) return;

            if (_.isUndefined(window.html2pdf)) {
                showToastNotification(t('toast.pdfLibMissing'), 'error');
                return;
            }

            showToastNotification(t('toast.pdfStart'), 'info');

            try {
                const iframeDocument = _.get(previewIframeRef.value, 'contentDocument');
                if (!iframeDocument) throw new Error('Preview iframe is not accessible.');

                const fileName = `${selectedFile.value.displayTitle}.pdf`;
                const pdfOptions = {
                    margin: [10, 10, 10, 10],
                    filename: fileName,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, backgroundColor: currentTheme.value === 'dark' ? '#101014' : '#ffffff' },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                };

                await html2pdf().set(pdfOptions).from(iframeDocument.body).save();
                showToastNotification(t('toast.fileDownloaded', { name: fileName }), 'success');
            } catch (error) {
                showToastNotification(t('toast.pdfFail'), 'error');
            }
        };

        const downloadSingleWebpFile = async () => {
            if (!selectedFile.value || !generatedHtmlContent.value) return;

            if (_.isUndefined(window.html2canvas)) {
                showToastNotification(t('toast.webpLibMissing'), 'error');
                return;
            }

            showToastNotification(t('toast.webpStart'), 'info');

            try {
                const iframeDocument = _.get(previewIframeRef.value, 'contentDocument');
                if (!iframeDocument) throw new Error('Preview iframe is not accessible.');

                const targetElement = iframeDocument.documentElement;
                const canvas = await html2canvas(targetElement, {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    windowWidth: targetElement.scrollWidth,
                    windowHeight: targetElement.scrollHeight,
                    backgroundColor: currentTheme.value === 'dark' ? '#101014' : '#ffffff',
                });

                const webpDataUrl = canvas.toDataURL('image/webp', 0.95);
                const fileName = `${selectedFile.value.displayTitle}.webp`;

                const anchorElement = document.createElement('a');
                anchorElement.href = webpDataUrl;
                anchorElement.download = fileName;

                document.body.appendChild(anchorElement);
                anchorElement.click();
                _.delay(() => document.body.removeChild(anchorElement), 100);

                showToastNotification(t('toast.fileDownloaded', { name: fileName }), 'success');
            } catch (error) {
                showToastNotification(t('toast.webpFail'), 'error');
            }
        };

        const downloadAllFilesAsZip = async () => {
            if (!hasUploadedFiles.value) return;

            if (_.isUndefined(window.JSZip)) {
                showToastNotification(t('toast.zipLibMissing'), 'error');
                return;
            }

            showToastNotification(t('toast.zipStart'), 'info');
            const zipInstance = new JSZip();
            let archivedFilesCount = 0;

            _.forEach(uploadedFiles.value, (fileItem) => {
                if (fileItem.conversionStatus === 'ready' && fileItem.generatedHtmlContent) {
                    zipInstance.file(`${fileItem.displayTitle}.html`, fileItem.generatedHtmlContent);
                    archivedFilesCount++;
                }
            });

            if (archivedFilesCount === 0) {
                showToastNotification(t('toast.zipNoFiles'), 'warning');
                return;
            }

            try {
                const zipBlobContent = await zipInstance.generateAsync({ type: 'blob' });
                const temporaryZipUrl = URL.createObjectURL(zipBlobContent);

                const anchorElement = document.createElement('a');
                anchorElement.href = temporaryZipUrl;
                anchorElement.download = t('export.defaultZipName') || 'monopress_export.zip';

                document.body.appendChild(anchorElement);
                anchorElement.click();
                document.body.removeChild(anchorElement);

                URL.revokeObjectURL(temporaryZipUrl);
                showToastNotification(t('toast.zipSuccess', { count: archivedFilesCount }), 'success');
            } catch (error) {
                showToastNotification(t('toast.zipError', { msg: error.message }), 'error');
            }
        };

        const copyHtmlSourceToClipboard = () => {
            if (!generatedHtmlContent.value) return;

            navigator.clipboard.writeText(generatedHtmlContent.value).then(() => {
                isSourceCopied.value = true;
                showToastNotification(t('toast.copied'), 'success');

                setTimeout(() => {
                    isSourceCopied.value = false;
                }, 2000);
            });
        };

        const printHtmlPreview = () => {
            const iframeWindow = _.get(previewIframeRef.value, 'contentWindow');
            if (iframeWindow) {
                iframeWindow.focus();
                iframeWindow.print();
            }
        };

        const applyThemeToDocument = () => {
            const resolvedTheme = currentTheme.value === 'system' ? (systemDarkModeQuery.matches ? 'dark' : 'light') : currentTheme.value;
            document.documentElement.setAttribute('data-theme', resolvedTheme);
        };

        const changeApplicationTheme = (themePreference) => {
            currentTheme.value = themePreference;
            localStorage.setItem(LOCAL_STORAGE_THEME_KEY, themePreference);
            applyThemeToDocument();
        };

        // --- Drag & Drop Event Handlers ---
        const handleGlobalDragEnter = (e) => {
            e.preventDefault();
            dragEventCounter++;
            isDragOverDropzone.value = true;
        };
        const handleGlobalDragLeave = (e) => {
            e.preventDefault();
            dragEventCounter--;
            if (dragEventCounter === 0) isDragOverDropzone.value = false;
        };
        const handleGlobalDragOver = (e) => {
            e.preventDefault();
        };
        const handleGlobalDrop = (e) => {
            e.preventDefault();
            dragEventCounter = 0;
            isDragOverDropzone.value = false;
            const droppedFiles = _.get(e, 'dataTransfer.files');
            if (droppedFiles) processIncomingFiles(droppedFiles);
        };

        onMounted(() => {
            applyThemeToDocument();

            const savedLang = localStorage.getItem(LOCAL_STORAGE_LANG_KEY) || 'en';

            if (savedLang !== 'en') {
                loadLanguageAsync(savedLang);
            }

            systemDarkModeQuery.addEventListener('change', () => {
                if (currentTheme.value === 'system') applyThemeToDocument();
            });
            window.addEventListener('dragenter', handleGlobalDragEnter);
            window.addEventListener('dragleave', handleGlobalDragLeave);
            window.addEventListener('dragover', handleGlobalDragOver);
            window.addEventListener('drop', handleGlobalDrop);

            document.addEventListener('click', closeDropdownsOnClickOutside);
        });

        onUnmounted(() => {
            window.removeEventListener('dragenter', handleGlobalDragEnter);
            window.removeEventListener('dragleave', handleGlobalDragLeave);
            window.removeEventListener('dragover', handleGlobalDragOver);
            window.removeEventListener('drop', handleGlobalDrop);

            document.removeEventListener('click', closeDropdownsOnClickOutside);
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

            // Download Dropdown
            isDownloadMenuOpen,
            downloadMenuRef,

            // Language Dropdown
            isLangMenuOpen,
            langMenuRef,
            currentLocale,
            currentLocaleName,

            t,

            selectedFile,
            rawMarkdownContent,
            generatedHtmlContent,
            hasUploadedFiles,
            dropzoneTitleText,
            copyButtonText,

            changeLocale,
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
            printHtmlPreview,
            changeApplicationTheme,
            isSourceCopied,
        };
    },
})
    .use(i18n)
    .mount('#app');
