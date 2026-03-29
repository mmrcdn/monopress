<div align="center">
  <h1>Monopress</h1>
  <p><b>Instantly render, preview, and export Markdown (.md) documents into print-optimized, monotone formats.</b></p>

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

  <br>
  <a href="https://mmrcdn.github.io/monopress/"><strong>Launch Monopress in Browser</strong></a>
  <br><br>
</div>

<br>

## Motivation

Markdown is the defacto standard for efficient documentation. However, natively printing these documents directly from a browser often results in broken
layouts, suboptimal typography, and inconsistent spacing. Furthermore, many enterprise or academic environments strictly restrict color printing, demanding
high-contrast grayscale output.

Monopress was engineered to bridge this gap. It is a browser-based, client-side utility that strictly enforces a clean, monotone aesthetic. It guarantees that
your documentation maintains perfect hierarchical clarity and readability, whether viewed on-screen or printed in black and white, without the overhead of
installing local software.

---

## Target Audience & Use Cases

- **Engineers & Developers**: Pre-flighting technical documentation (e.g., READMEs, API specs) to ensure rendering fidelity before committing to a repository or
  sharing with stakeholders.
- **Professionals in Restrictive Print Environments**: Generating clean, professional reports and specifications without relying on color cues to convey
  information structure.
- **Students & Researchers**: Compiling markdown-based notes into robust, submission-ready PDFs without formatting discrepancies.
- **Product Managers**: Archiving meeting minutes or project requirements into lightweight image formats (WEBP) for rapid dissemination via communication
  channels.

---

## Core Features

### Print-Optimized Monotone Architecture

The default stylesheet is explicitly designed for monochrome output. It ensures that textual hierarchy (headings), code blocks, blockquotes, and tables are
distinctly recognizable through typography and spacing alone, eliminating the reliance on color.

### Frictionless Batch Processing

Bypass tedious upload dialogs. Seamlessly ingest multiple `.md` files into the workspace via drag-and-drop. The parsing engine immediately processes the queue.

### Real-Time 3-Way Workspace

- **Markdown View**: Inspect the raw markdown syntax.
- **Preview**: Review the fully rendered, print-ready document in real-time.
- **HTML Source**: Access and copy the compiled HTML markup, complete with inline styles if necessary.

### Comprehensive Export Pipeline

- **PDF Export**: Generate immutable, high-fidelity PDFs directly via the browser's rendering engine, ideal for formal distribution.
- **WEBP Export**: Capture the entire document sequence as a highly compressed, web-optimized image.
- **HTML & Batch ZIP**: Download the compiled HTML source. For multiple files, execute a batch export to a single ZIP archive.

### Custom Styling Injection

Need to override the default monotone constraints? Inject a custom CSS URL via the sidebar parameters. The DOM will immediately repaint the document utilizing
your proprietary stylesheet.

### 100% Client-Side Processing (Zero-Trust Privacy)

Handle sensitive internal documentation or proprietary code with confidence. The entire parsing and conversion pipeline executes locally within your browser's
execution context. Zero payload is transmitted to external servers, ensuring absolute data privacy.

---

## Quick Start Guide

1. **Ingest**: Drag and drop your target `.md` files into the application interface.
2. **Inspect**: Utilize the `Preview` tab to verify the rendered output and typography.
3. **Export & Execute**:
    - Trigger the `Print` function via the toolbar for immediate physical output.
    - Utilize the `Export` dropdown to generate and download a PDF, WEBP, or HTML file.

---

## FAQ

**Q. Why does the PDF formatting or pagination appear slightly inconsistent?** A. Client-side PDF generation relies heavily on the host browser's native
rendering engine. For optimal fidelity and consistent `@media print` behavior, we strongly recommend utilizing a Chromium-based browser (e.g., Google Chrome) in
a desktop environment.

**Q. Does Monopress require an active internet connection?** A. Initializing the application requires a connection to fetch external web fonts and localization
assets. However, the core Markdown parsing and document generation logic operates entirely locally.

**Q. How does the UI Dark Mode interact with the final print output?** A. The application supports a system-synced dark mode to reduce visual fatigue during
authoring. However, the underlying print stylesheets (`@media print`) are strictly configured to inverse these colors, ensuring the physical output is always
optimized for white paper and black ink.

---

## Contributing

Contributions, issues, and feature requests are welcome. If you identify a bug or possess a feature enhancement, please open an issue in the repository to
initiate a discussion.

---

## License

Distributed under the MIT License. See the `LICENSE` file for detailed information.

<br>
<div align="center">
  <i>Powered by AURM & MMR</i>
</div>
