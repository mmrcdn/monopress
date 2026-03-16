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

const { createApp, ref, computed, onMounted, onUnmounted, watch } = Vue;

createApp({
    /**
     * Setup composition logic for the application.
     * @returns {Object} Reactive variables and functions exposed to template.
     */
    setup() {
        // Refs
        /** @type {import('vue').Ref<File|null>} */
        const file = ref(null);

        /** @type {import('vue').Ref<boolean>} */
        const isDragging = ref(false);

        /** @type {import('vue').Ref<boolean>} */
        const isSidebarOpen = ref(true);

        /** @type {import('vue').Ref<string>} */
        const finalHtml = ref('');

        /** @type {import('vue').Ref<'idle'|'ready'|'converting'|'error'>} */
        const status = ref('idle');

        /** @type {import('vue').Ref<'preview'|'source'>} */
        const activeTab = ref('preview');

        /** @type {import('vue').Ref<boolean>} */
        const copied = ref(false);

        /** @type {import('vue').Ref<HTMLIFrameElement|null>} */
        const previewFrameRef = ref(null);

        // Conversion Options State (Simplified)
        const options = ref({
            title: '',
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
            type: 'success', // 'success' | 'error'
            visible: false,
        });
        let toastTimer = null;

        /**
         * @type {number}
         * Counter to prevent dragleave flickering when crossing child elements.
         */
        let dragCounter = 0;

        // Computed
        /**
         * Returns the default title parsed from filename without extension.
         * @returns {string} The formatted default title.
         */
        const defaultTitle = computed(() => {
            return file.value ? file.value.name.replace(/\.md$/i, '') : 'MARKDOWN';
        });

        /**
         * Translates status into human readable text.
         * @returns {string} Status label string.
         */
        const statusText = computed(() => {
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
         * @param {string} msg - The message to display.
         * @param {'success'|'error'} type - The severity type of the toast.
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
         * Reads the loaded file and triggers the HTML build process.
         * Uses hardcoded UTF-8 and 4-space indentation logic for simplicity.
         * @returns {void}
         */
        const convertFile = () => {
            if (!file.value) return;

            status.value = 'converting';
            const reader = new FileReader();

            reader.onload = (e) => {
                setTimeout(() => {
                    try {
                        const rawMd = e.target.result;
                        const titleStr = options.value.title.trim() || defaultTitle.value;
                        const cssStr = options.value.cssUrl.trim() || 'https://mmrcdn.github.io/monopress/ui@markdown.css';

                        // 1. Parse markdown
                        const bodyHtml = marked.parse(rawMd);

                        // 2. Wrap inside boilerplate skeleton (Hardcoded UTF-8)
                        const skeleton = [
                            '<!doctype html>',
                            '<html>',
                            '    <head>',
                            `        <title>${escapeHtml(titleStr)}</title>`,
                            `        <meta http-equiv="Content-type" content="text/html;charset=UTF-8" />`,
                            `        <link rel="stylesheet" href="${escapeHtml(cssStr)}" />`,
                            '    </head>',
                            '    <body>',
                            bodyHtml,
                            '    </body>',
                            '</html>',
                        ].join('\n');

                        // 3. Beautify via js-beautify (Hardcoded 4 space indent)
                        finalHtml.value = html_beautify(skeleton, {
                            indent_size: 4,
                            indent_char: ' ',
                            max_preserve_newlines: 1,
                            preserve_newlines: true,
                            indent_inner_html: false,
                            wrap_line_length: 0,
                            end_with_newline: false,
                            extra_liners: ['head', 'body', '/html'],
                        });

                        status.value = 'ready';
                        activeTab.value = 'preview';
                        showToast('Completed', 'success');

                        // 변환 완료 후 사이드바를 자동으로 닫아 넓게 볼 수 있도록 조정
                        if (window.innerWidth < 1024) {
                            isSidebarOpen.value = false;
                        }
                    } catch (err) {
                        status.value = 'error';
                        showToast('Error: ' + err.message, 'error');
                    }
                }, 300);
            };

            reader.readAsText(file.value, 'UTF-8');
        };

        /**
         * Processes and loads the incoming file reference. Automatically triggers conversion.
         * @param {File} selectedFile - The file to load.
         * @returns {void}
         */
        const loadFile = (selectedFile) => {
            if (!selectedFile) return;

            if (selectedFile.name.endsWith('.md') || selectedFile.type === 'text/markdown' || selectedFile.type === 'text/plain') {
                file.value = selectedFile;
                status.value = 'idle';
                finalHtml.value = '';
                options.value.title = '';

                // 파일 선택 즉시 자동 변환 호출
                convertFile();
            } else {
                showToast('Only for .md file', 'error');
            }
        };

        /**
         * Event handler for standard file input change.
         * @param {Event} e - DOM event.
         * @returns {void}
         */
        const handleFileInput = (e) => loadFile(e.target.files[0]);

        /**
         * Clears the current loaded file and resets the workspace.
         * @returns {void}
         */
        const clearFile = () => {
            file.value = null;
            finalHtml.value = '';
            status.value = 'idle';
            activeTab.value = 'preview';
        };

        /**
         * Triggers a download sequence of the generated HTML.
         * @returns {void}
         */
        const downloadHtml = () => {
            if (!finalHtml.value || !file.value) return;

            const name = file.value.name.replace(/\.md$/i, '') + '.html';
            const blob = new Blob([finalHtml.value], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast(`${name} is downloaded`, 'success');
        };

        /**
         * Copies the raw HTML source code into the user's clipboard.
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

        /**
         * Handles global drag enter event to show the overlay.
         * @param {DragEvent} e - DOM Drag event.
         */
        const handleGlobalDragEnter = (e) => {
            e.preventDefault();
            dragCounter++;
            isDragging.value = true;
        };

        /**
         * Handles global drag leave event to hide the overlay.
         * @param {DragEvent} e - DOM Drag event.
         */
        const handleGlobalDragLeave = (e) => {
            e.preventDefault();
            dragCounter--;
            if (dragCounter === 0) {
                isDragging.value = false;
            }
        };

        /**
         * Prevents default behavior for global drag over event.
         * @param {DragEvent} e - DOM Drag event.
         */
        const handleGlobalDragOver = (e) => {
            e.preventDefault();
        };

        /**
         * Handles global drop event and loads the dropped file.
         * @param {DragEvent} e - DOM Drag event.
         */
        const handleGlobalDrop = (e) => {
            e.preventDefault();
            dragCounter = 0;
            isDragging.value = false;
            if (e.dataTransfer && e.dataTransfer.files) {
                loadFile(e.dataTransfer.files[0]);
            }
        };

        // Lifecycle Hook Listeners
        onMounted(() => {
            applyTheme();
            mediaQuery.addEventListener('change', () => {
                if (theme.value === 'system') applyTheme();
            });

            // Register global drag and drop event listeners
            window.addEventListener('dragenter', handleGlobalDragEnter);
            window.addEventListener('dragleave', handleGlobalDragLeave);
            window.addEventListener('dragover', handleGlobalDragOver);
            window.addEventListener('drop', handleGlobalDrop);
        });

        onUnmounted(() => {
            // Unregister global drag and drop event listeners
            window.removeEventListener('dragenter', handleGlobalDragEnter);
            window.removeEventListener('dragleave', handleGlobalDragLeave);
            window.removeEventListener('dragover', handleGlobalDragOver);
            window.removeEventListener('drop', handleGlobalDrop);
        });

        return {
            file,
            isDragging,
            isSidebarOpen,
            options,
            finalHtml,
            status,
            activeTab,
            theme,
            copied,
            previewFrameRef,
            defaultTitle,
            statusText,
            toastData,
            toggleSidebar,
            handleFileInput,
            clearFile,
            convertFile,
            downloadHtml,
            copySource,
            printPreview,
            setTheme,
        };
    },
}).mount('#app');