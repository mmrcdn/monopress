/**
 * Set marked.js options for correct Markdown parsing.
 */
marked.setOptions({ gfm: true, breaks: false });

/**
 * Custom renderer for marked to encode anchor IDs natively.
 */
const renderer = new marked.Renderer();
renderer.heading = function (text, level) {
    const headingText = typeof text === 'string' ? text : text.text;
    const headingLevel = typeof text === 'string' ? level : text.depth;
    const escapedText = encodeURIComponent(headingText.replace(/<[^>]*>?/gm, '').trim());
    return `<h${headingLevel} id="${escapedText}">${headingText}</h${headingLevel}>\n`;
};
marked.use({ renderer });

const { createApp, ref, computed, onMounted, onUnmounted } = Vue;

createApp({
    /**
     * Setup composition logic for the application.
     * @returns {Object} Reactive variables and functions exposed to template.
     */
    setup() {
        // Refs
        /** * @typedef {Object} FileItem
         * @property {string} id Unique identifier
         * @property {File} file Original File object
         * @property {string} title Formatted title
         * @property {string} rawMd Original markdown string
         * @property {string} finalHtml Converted HTML result
         * @property {'idle'|'ready'|'converting'|'error'} status Conversion status
         */

        /** @type {import('vue').Ref<FileItem[]>} */
        const files = ref([]);

        /** @type {import('vue').Ref<string|null>} */
        const activeFileId = ref(null);

        /** @type {import('vue').Ref<boolean>} */
        const isDragging = ref(false);

        /** @type {import('vue').Ref<boolean>} */
        const isSidebarOpen = ref(true);

        /** @type {import('vue').Ref<'markdown'|'preview'|'source'>} */
        const activeTab = ref('preview'); // 기본 탭은 미리보기로 유지

        /** @type {import('vue').Ref<boolean>} */
        const copied = ref(false);

        /** @type {import('vue').Ref<HTMLIFrameElement|null>} */
        const previewFrameRef = ref(null);

        // Global Options
        const options = ref({
            cssUrl: 'https://mmrcdn.github.io/monopress/ui@markdown.css',
        });

        // Theme Management
        const THEME_KEY = 'md-converter-theme-vue';
        /** @type {import('vue').Ref<'system'|'light'|'dark'>} */
        const theme = ref(localStorage.getItem(THEME_KEY) || 'system');
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        // Toast Management
        const toastData = ref({
            message: '',
            type: 'success',
            visible: false,
        });
        let toastTimer = null;
        let dragCounter = 0;

        // Computed Properties

        /**
         * Get the currently active file object.
         * @returns {FileItem|undefined}
         */
        const activeFile = computed(() => files.value.find((f) => f.id === activeFileId.value));

        /**
         * Raw Markdown text of the active file.
         * @returns {string}
         */
        const rawMarkdown = computed(() => activeFile.value?.rawMd || '');

        /**
         * Final HTML of the active file.
         * @returns {string}
         */
        const finalHtml = computed(() => activeFile.value?.finalHtml || '');

        /**
         * Global or active file status.
         * @returns {'idle'|'ready'|'converting'|'error'}
         */
        const status = computed(() => activeFile.value?.status || 'idle');

        /**
         * Human readable status text.
         * @returns {string}
         */
        const statusText = computed(() => {
            if (files.value.length > 0 && !activeFile.value) return 'No selection';
            const map = {
                idle: `Waiting...`,
                converting: `Converting...`,
                ready: `Complete`,
                error: `An error occurred`,
            };
            return map[status.value] || map.idle;
        });

        // Methods

        /**
         * Toggles the visibility state of the sidebar.
         * @returns {void}
         */
        const toggleSidebar = () => {
            isSidebarOpen.value = !isSidebarOpen.value;
        };

        /**
         * Displays a toast notification in the application viewport.
         * @param {string} msg The message to display.
         * @param {'success'|'error'|'info'|'warning'} type The severity type of the toast.
         * @returns {void}
         */
        const showToast = (msg, type = 'success') => {
            clearTimeout(toastTimer);
            toastData.value = { message: msg, type, visible: true };
            toastTimer = setTimeout(() => {
                toastData.value.visible = false;
            }, 2800);
        };

        /**
         * Formats byte size into human readable string.
         * @param {number} bytes File size in bytes.
         * @returns {string} Formatted size (KB/MB).
         */
        const formatSize = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        };

        /**
         * Converts a single file item from Markdown to HTML.
         * @param {FileItem} item The reactive file item reference.
         * @returns {void}
         */
        const convertSingleFile = (item) => {
            item.status = 'converting';
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const rawMd = e.target.result;
                    item.rawMd = rawMd; // 마크다운 원본 저장

                    const cssStr = options.value.cssUrl.trim() || 'https://mmrcdn.github.io/monopress/ui@markdown.css';
                    const bodyHtml = marked.parse(rawMd);

                    const skeleton = [
                        '<!doctype html>',
                        '<html>',
                        '    <head>',
                        `        <title>${escapeHtml(item.title)}</title>`,
                        `        <meta http-equiv="Content-type" content="text/html;charset=UTF-8" />`,
                        `        <link rel="stylesheet" href="${escapeHtml(cssStr)}" />`,
                        '    </head>',
                        '    <body>',
                        bodyHtml,
                        '    </body>',
                        '</html>',
                    ].join('\n');

                    item.finalHtml = html_beautify(skeleton, {
                        indent_size: 4,
                        indent_char: ' ',
                        max_preserve_newlines: 1,
                        preserve_newlines: true,
                        indent_inner_html: false,
                        wrap_line_length: 0,
                        end_with_newline: false,
                        extra_liners: ['head', 'body', '/html'],
                    });

                    item.status = 'ready';
                } catch (err) {
                    item.status = 'error';
                    showToast('Error converting ' + item.title, 'error');
                }
            };

            reader.readAsText(item.file, 'UTF-8');
        };

        /**
         * Processes and loads incoming file references into the stack.
         * @param {FileList|File[]} fileList The file(s) to load.
         * @returns {void}
         */
        const loadFiles = (fileList) => {
            if (!fileList || fileList.length === 0) return;

            let addedCount = 0;
            Array.from(fileList).forEach((selectedFile) => {
                if (selectedFile.name.endsWith('.md') || selectedFile.type === 'text/markdown' || selectedFile.type === 'text/plain') {
                    const newId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    const newItem = {
                        id: newId,
                        file: selectedFile,
                        title: selectedFile.name.replace(/\.md$/i, ''),
                        rawMd: '',
                        finalHtml: '',
                        status: 'idle',
                    };

                    // 버그 수정: 반응형(Proxy) 객체를 가져오기 위해 배열 푸시 후 인덱스로 접근
                    const newIndex = files.value.push(newItem) - 1;
                    const reactiveItem = files.value[newIndex];

                    addedCount++;

                    // If it's the first file, auto select it
                    if (!activeFileId.value) activeFileId.value = newId;

                    // Begin conversion using the reactive item
                    convertSingleFile(reactiveItem);
                }
            });

            if (addedCount > 0) {
                showToast(`${addedCount} files loaded`, 'success');
                if (window.innerWidth < 1024) isSidebarOpen.value = false;
            } else {
                showToast('Only .md files are supported', 'error');
            }
        };

        /**
         * Re-converts all files (Useful when global CSS option changes).
         * @returns {void}
         */
        const reconvertAll = () => {
            files.value.forEach((item) => convertSingleFile(item));
            showToast('Applied global options to all files', 'success');
        };

        /**
         * Event handler for standard file input change.
         * @param {Event} e DOM event.
         * @returns {void}
         */
        const handleFileInput = (e) => loadFiles(e.target.files);

        /**
         * Removes a specific file from the stack.
         * @param {string} id The file id to remove.
         * @returns {void}
         */
        const removeFile = (id) => {
            const index = files.value.findIndex((f) => f.id === id);
            if (index > -1) {
                files.value.splice(index, 1);
                if (activeFileId.value === id) {
                    // Select next or prev item
                    if (files.value.length > 0) {
                        activeFileId.value = files.value[Math.min(index, files.value.length - 1)].id;
                    } else {
                        activeFileId.value = null;
                        activeTab.value = 'preview';
                    }
                }
            }
        };

        /**
         * Clears all files from the workspace.
         * @returns {void}
         */
        const clearAllFiles = () => {
            files.value = [];
            activeFileId.value = null;
            activeTab.value = 'preview';
            showToast('Workspace cleared', 'info');
        };

        /**
         * Triggers a download sequence of the generated HTML for the ACTIVE file.
         * @returns {void}
         */
        const downloadHtml = () => {
            if (!activeFile.value || !finalHtml.value) return;

            const name = activeFile.value.title + '.html';
            const blob = new Blob([finalHtml.value], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast(`${name} downloaded`, 'success');
        };

        /**
         * Compresses all converted HTML files into a ZIP and triggers download.
         * @returns {Promise<void>}
         */
        const downloadZip = async () => {
            if (files.value.length === 0) return;

            // Ensure JSZip is loaded
            if (typeof JSZip === 'undefined') {
                showToast('JSZip library is missing', 'error');
                return;
            }

            showToast('Compressing files...', 'info');
            const zip = new JSZip();
            let addedCount = 0;

            files.value.forEach((item) => {
                if (item.status === 'ready' && item.finalHtml) {
                    zip.file(`${item.title}.html`, item.finalHtml);
                    addedCount++;
                }
            });

            if (addedCount === 0) {
                showToast('No ready files to compress.', 'warning');
                return;
            }

            try {
                const content = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(content);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'monopress_export.zip';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                showToast(`Exported ${addedCount} files as ZIP`, 'success');
            } catch (err) {
                showToast('ZIP Error: ' + err.message, 'error');
            }
        };

        /**
         * Copies the active raw HTML source code into the user's clipboard.
         * @returns {void}
         */
        const copySource = () => {
            if (!finalHtml.value) return;

            navigator.clipboard.writeText(finalHtml.value).then(() => {
                copied.value = true;
                showToast('Copied', 'success');
                setTimeout(() => {
                    copied.value = false;
                }, 2000);
            });
        };

        /**
         * Triggers the browser's print dialog localized to the preview iframe.
         * @returns {void}
         */
        const printPreview = () => {
            if (previewFrameRef.value && previewFrameRef.value.contentWindow) {
                previewFrameRef.value.contentWindow.focus();
                previewFrameRef.value.contentWindow.print();
            }
        };

        /**
         * Updates the HTML document theme attribute and saves preference.
         * @param {'system'|'light'|'dark'} val - The theme preference identifier.
         * @returns {void}
         */
        const setTheme = (val) => {
            theme.value = val;
            localStorage.setItem(THEME_KEY, val);
            applyTheme();
        };

        /**
         * Resolves and sets the active visual theme on the DOM element.
         * @returns {void}
         */
        const applyTheme = () => {
            const effective = theme.value === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : theme.value;
            document.documentElement.setAttribute('data-theme', effective);
        };

        /**
         * Escapes potentially dangerous characters for safe HTML attribute injection.
         * @param {string} s - Original unsafe string.
         * @returns {string} Sanitized string.
         */
        const escapeHtml = (s) => {
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        };

        // Global Drag & Drop Handlers
        const handleGlobalDragEnter = (e) => {
            e.preventDefault();
            dragCounter++;
            isDragging.value = true;
        };
        const handleGlobalDragLeave = (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter === 0) isDragging.value = false;
        };
        const handleGlobalDragOver = (e) => {
            e.preventDefault();
        };
        const handleGlobalDrop = (e) => {
            e.preventDefault();
            dragCounter = 0;
            isDragging.value = false;
            if (e.dataTransfer && e.dataTransfer.files) {
                loadFiles(e.dataTransfer.files);
            }
        };

        // Lifecycle Hooks
        onMounted(() => {
            applyTheme();
            mediaQuery.addEventListener('change', () => {
                if (theme.value === 'system') applyTheme();
            });
            window.addEventListener('dragenter', handleGlobalDragEnter);
            window.addEventListener('dragleave', handleGlobalDragLeave);
            window.addEventListener('dragover', handleGlobalDragOver);
            window.addEventListener('drop', handleGlobalDrop);
        });

        onUnmounted(() => {
            window.removeEventListener('dragenter', handleGlobalDragEnter);
            window.removeEventListener('dragleave', handleGlobalDragLeave);
            window.removeEventListener('dragover', handleGlobalDragOver);
            window.removeEventListener('drop', handleGlobalDrop);
        });

        return {
            files,
            activeFileId,
            activeFile,
            isDragging,
            isSidebarOpen,
            options,
            rawMarkdown,
            finalHtml,
            status,
            activeTab,
            theme,
            copied,
            previewFrameRef,
            statusText,
            toastData,
            formatSize,
            toggleSidebar,
            handleFileInput,
            removeFile,
            clearAllFiles,
            downloadHtml,
            downloadZip,
            copySource,
            printPreview,
            setTheme,
            reconvertAll,
        };
    },
}).mount('#app');
