# NQoS Toolbox - Application Roadmap

This document outlines the prioritized suite of applications for the "NQoS Toolbox".

---

## Category Groups
> These groups are reflected on the landing page (`index.html`). Keep this table in sync when adding or moving apps.

| Category | Badge Color | Apps | Status |
| :--- | :--- | :--- | :--- |
| 🔄 **Conversion** | Orange | Excel to KMZ, KMZ to Excel, Universal Map Converter | ✅ Live / 🚧 Planned |
| 🗺️ **Visualization** | Green | KMZ Viewer, KMZ Feature Auditor, KMZ Style Mapper | ✅ Live |
| 📊 **Analysis** | Purple | Polygons Overlap, Nearest Polygon, Point Buffer, Neighbor Auditor, Driving Distance | ✅ Live / 🚧 Planned |
| 🔧 **Utilities** | Gray | KMZ Merger, KML Splitter | ✅ Live (unlisted) |

---

## Live Applications
These are the active core applications currently available in the NQoS Toolbox.

| # | App Name | Category | Use Case | Input | Output | On Landing Page |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 0 | **Landing Page** | N/A | Central hub to access all tools. | N/A | Navigation | — |
| 1 | **Excel to KMZ** | Convert | Convert site lists to Google Earth point placemarks. | Excel/CSV (Lat/Long) | .kmz (Placemarks) | ✅ |
| 2 | **KMZ to Excel** | Convert | Extract data from KMZ/KML back to a spreadsheet. | .kmz / .kml | Excel (Name, Lat, Long) | ✅ |
| 3 | **KMZ Viewer** | Visualization | Lightweight, offline KMZ map viewer. | .kmz / .kml | Interactive Map | ✅ |
| 4 | **KMZ Feature Auditor** | Visualization | Map-based field review driven by Excel. Zoom, verify, annotate. Auto-marks unannotated rows as "skipped!" | Excel + Multiple KMZ | Annotated Excel | ✅ |
| 5 | **KMZ Style Mapper** | Visualization | Color-code map polygons and points based on an Excel value column. | KMZ + Excel | Styled KMZ | ✅ |
| 6 | **Point Buffer** | Analysis | Generate circular buffer zones (donuts) around point coordinates. | Excel/CSV (Lat/Long) | KMZ Circles | ✅ |
| 7 | **Polygons Overlap** | Analysis | Calculate spatial overlap % of one KMZ layer over another. Grid-indexed for performance. | 2 × KMZ | Excel Stats | ✅ |
| 8 | **Nearest Polygon** | Analysis | Map point coordinates to containing polygons; find nearest for unmatched points (default threshold: 3000 m). Optimized with bbox pruning. | KMZ + Excel | Excel Results | ✅ |
| 9 | **KMZ Merger** | Utilities | Combine multiple KMZ/KML files into one. | Multiple KMZ/KML | KMZ | ⚠️ Unlisted |
| 10 | **KML Splitter** | Utilities | Split large KML/KMZ files into smaller chunks. | KMZ/KML | Zip (KMZs) | ⚠️ Unlisted |
| 11 | **Neighbor Auditor** | Analysis | Identify neighboring sites based on distance parameters. | Excel (Sites) | Excel (Neighbors) | ⚠️ Unlisted |
| 12 | **Driving Distance** | Analysis | Calculate routing distances between an origin and destination list. | Excel (Lat/Long) | Excel (Routes) | ⚠️ Unlisted |

---

## Planned Applications
Applications queued for future implementation, not yet built.

| App Name | Category | Use Case | Input | Output |
| :--- | :--- | :--- | :--- | :--- |
| **Universal Map Converter** | Convert | Convert between popular spatial formats (GeoJSON, KML/KMZ, Shapefile, CSV, DXF) with dynamic settings. | Any top spatial format | Any top spatial format |
| **System Evaluation** | Admin | Central tracker for system health and processed jobs. | System Logs | Dashboard |

---

## Shared Settings & Architecture
These settings apply across all applications to ensure a consistent experience.

### 🔌 Offline-First Requirement
> **All apps and the entire project must run fully offline — no internet connection required.**

- All third-party libraries (Leaflet, JSZip, SheetJS, toGeoJSON, Font Awesome, Google Fonts, etc.) must be **vendored locally** under a shared `vendor/` directory and referenced via relative paths — no CDN links.
- Map tile layers must either use a **locally bundled tile set** or a **tile server running on the local machine** (e.g., a simple HTTP server serving MBTiles). A fallback blank/offline tile layer should always be available.
- No API calls to external services should be required for core functionality. Features that depend on external APIs (e.g., driving distance) should degrade gracefully with a clear "Requires internet" notice.
- The project must be openable by simply double-clicking `index.html` (or served via a local HTTP server like `npx serve`) — no build step, no Node.js backend, no cloud dependency.

### ⚙️ General Settings
- **Default Map Center**: User-defined Lat/Long for map previews (e.g., Saudi Arabia region).
- **Measurement Units**: Metric (Meters/Km) vs Imperial (Feet/Miles).
- **Default Output Prefix**: Custom prefix for generated filenames (e.g., "Converted_").
- **Smart Column Detection**:
    - Auto-detect if coordinates are in **1 column** (e.g., "25.12, 55.12") or **2 columns** (Lat/Long).
    - Auto-select columns based on headers (avoid misleading names like "Long Shop Code").
    - Support keywords: "GPS", "Coordinates", "Location", "Position", "Lat", "Long".
    - **Important**: If a column cannot be confidently detected, **do not select any** (leave blank/default).

### 🏷️ Unified Output Naming Architecture
- Every tool must output its primary exported file following the strict format: `[OriginalFileName]_[ActionSuffix].[ext]`.
- Specifically, strip the original `.ext` from the uploaded file's name, append an underscore, append the tool's designated `ActionSuffix`, then append the final `.ext`.
- **Exceptions**: Multi-file aggregators (like KMZ Merger) use `Merged_[Timestamp].kmz`. Splitters outputting zipped collections use `[OriginalName]_Split.zip`.

### 🚀 Standard Application Workflow (SPA)
Unless a tool explicitly requires a different approach (e.g. streaming, or map-only views), all tools must follow this 4-step Single Page Application (SPA) workflow:

1. **Upload View**: Intake via a unified drag-and-drop zone. Validates file type.
2. **Configuration View**: Presents all user-configurable parameters (checkboxes, dropdowns mapping to columns). Auto-detects where possible but allows override. Includes "Cancel" and "Process" buttons.
3. **Processing View**: Blocks interaction. Shows progress bar and status text. Initiates background processing.
4. **Result View**: Confirms completion. Automatically triggers browser download using `[OriginalFileName]_[ActionSuffix].[ext]`. Provides a **"Download Again"** and "Process another file" button.

### 🧰 Shared Components
- **Unified File Inputs (Non-Map Apps)**:
    - Uses a standard file drop zone component from `shared.js`.
    - *Note: Map-based apps use custom overlays.*
- **Job Tracker**: Every app must call `JobTracker.start()`, `JobTracker.finish()`, and `JobTracker.fail()` to log to the system history.
- **`yieldToMain()`**: Chunk-based async processing must use `await yieldToMain()` (defined in `shared.js`) to avoid browser throttling in background tabs.

---

## 📄 Templates

The NQoS Toolbox architecture is built upon standardized components to ensure a unified experience.

### 1. Core UI Components
- **Navbar**: Globe icon + "NQoS Tools" brand text. Links back to `../index.html`.
- **Navigation Cards**: Clickable, elevated cards on the landing page for tool selection. Each has an icon tile, title, 3-line description, and IO strip.
- **Configuration Panels**: `max-width: 800px` container. White card with subtle shadow and rounded corners. Settings grouped into `#fafafa` sub-blocks with consistent padding. Action toolbar centered below.
- **Result Screens**: Large success icon (`#95c11f` green), prominent heading, `result-stats-board` div for summary stats, then action buttons. See template below.
- **Action Buttons**: `.btn-action-main` class.
- **Upload Zones**: Standard drag-and-drop zones via `setupUnifiedDropZone()` in `shared.js`.

### 2. Result View Template (Canonical)
All apps must use this exact structure for the result view:

```html
<!-- VIEW 4: RESULT -->
<div id="result-view" class="view hidden" style="text-align:center;">
    <i class="fa-solid fa-check-circle" style="font-size: 60px; color: #95c11f; margin-bottom: 20px;"></i>
    <h2 style="margin-bottom:20px;">[Action] Completed!</h2>
    <div id="result-summary" class="result-stats-board"></div>
    <button class="btn-action-main" id="btn-download">
        <i class="fa-solid fa-download"></i> Download Again
    </button>
    <div style="margin-top:20px;">
        <button id="btn-restart" style="background:none; border:none; color:#666; text-decoration:underline; cursor:pointer;">[Verb] another file</button>
    </div>
</div>
```

**Rules:**
- Icon color is always `#95c11f` (NQoS green), **not** `var(--color-primary)` (red).
- No `<br>` tags between `result-summary` and the download button.
- `result-summary` must have **no inline `style` overrides** — only the `result-stats-board` class.
- Download button label is always **"Download Again"**, regardless of the tool.

### 3. The 4-Step SPA Workflow & Job Tracking
All new standard tools follow this consistent flow. **Every app MUST implement standard `JobTracker` logging.**

1. **Upload**: Call `JobTracker.start('AppName', files)` when files are accepted.
2. **Configuration**: Call `JobTracker.interaction(job, ...)` for important config changes. Call `JobTracker.cancel(job, ...)` if user cancels.
3. **Processing**: Use `try...catch` for all logic. Use `await yieldToMain()` for chunk loops. Call `JobTracker.fail(job, ...)` on error.
4. **Result**: Call `JobTracker.finish(job, [outputFile])` when output is ready. Auto-download the file.

---

## Application Definitions

### 0. Landing Page (`index.html`)
> The central unified dashboard for the NQoS Toolbox.

#### Key Features
- **Unified Flexbox Layout:** All applications displayed in a responsive CSS flexbox, up to 95% width.
- **Categorized Badges:** Apps marked with color-coded category badges.
- **Category Filter Bar:** Interactive filter bar to filter tool cards by category.
- **Secret History Access:** Press `Alt + H` to access the hidden system history page.

### 1. Excel to KMZ
> **Standard 4-step SPA.** Upload Excel or CSV. Config: auto-detect lat/lon columns, group by column, visual icon picker per group, icon scaling, include-all-columns in popup, optional description. Process: generates KMZ with point placemarks. Result: auto-download. Includes "See it in KMZ Viewer" shortcut on result screen.

### 2. KMZ to Excel
> **Standard 4-step SPA.** Upload KMZ/KML. Config: toggle extraction of Description and Altitude. Process: parses all Placemarks to Excel. Result: auto-download.

### 3. KMZ Viewer
> **Map-Based SPA (no config step).** Drag-and-drop one or more KMZ/KML files to render on an interactive Leaflet map. Features: layer management with feature counts, Google Earth-style satellite imagery date, canvas-based rendering for 20k+ points, offline-first.

### 4. KMZ Feature Auditor
> **Map-Based SPA.** Excel-driven field annotation tool. Walk row-by-row, auto-zoom to matching map features, type audit notes, export annotated Excel.

#### Key Features
- **Session Persistence**: Row position and all annotations saved to `localStorage`.
- **Auto-Skip**: Navigating away from an unannotated row automatically marks it as **"skipped!"**. Export also fills any remaining empty annotations with "skipped!".
- **Enter-to-Advance**: `Enter` in the note field saves and moves to the next row.
- **Keyboard Navigation**: Arrow keys navigate rows.
- **Live Stats**: Real-time annotation breakdown in the sidebar.

### 5. KMZ Style Mapper (KMZ Color Coder)
> **Standard 4-step SPA.** Upload KMZ + Excel. Config: match key column, select value column, choose color gradient or categorical palette. Process: applies color fills to matched features. Result: auto-download styled KMZ.

### 6. Point Buffer
> **Standard 4-step SPA.** Upload Excel/CSV. Config: select lat/lon columns, enter comma-separated radius values (e.g., "500, 1000"). Process: generates circular polygon buffers. Result: auto-download KMZ of circles.

### 7. Polygons Overlap
> **Standard 4-step SPA.** Upload two KMZ files (Coverage Layer A, Covered Layer B). Config: filter target polygons by column value, select overlap data column. Process: calculates spatial intersection % for each target polygon against source layer. **Performance**: pre-computed bboxes and areas, grid spatial index for O(k) source lookup, binary-tree union reduction. Result: auto-download Excel with `Coverage_Percent` column.

### 8. Nearest Polygon
> **Standard 4-step SPA.** Upload KMZ (polygons) + Excel (points). Config: select lat/lon columns, set max distance threshold (default: **3000 m** — estimated 4G radius in suburban areas). Process: ray-casting containment check with bbox pre-filter; if uncontained, haversine nearest-segment search within threshold. **Performance**: pre-computed polygon bboxes, `bboxMinDist()` lower-bound pruning. Result screen shows: **Total → N Linked** (M within polygons + K linked to nearest) **/ Not Linked**.

### 9. KMZ Merger (Unlisted)
> **Standard 4-step SPA.** Combine multiple KMZ/KML files into a single KMZ. Output: `Merged_[Timestamp].kmz`.

### 10. KML Splitter (Unlisted)
> **Standard 4-step SPA.** Split a large KML/KMZ file into smaller chunks by feature count. Output: `[OriginalName]_Split.zip`.

### 11. Neighbor Auditor (Unlisted)
> **Standard 4-step SPA.** Analyze distances and potential neighbor relationships between sites. Output: Excel with neighbor pairs.

### 12. Driving Distance (Unlisted)
> **Standard 4-step SPA.** Calculate routing distances between an origin and a list of destinations. Requires internet (OSRM or similar). Output: Excel distance matrix.

### Planned: Universal Map Converter
> **Standard 4-step SPA.** Upload any popular spatial format (GeoJSON, KML, KMZ, Shapefile zip, CSV with WKT, DXF). Auto-recognize input format. Config: select output format with dynamic format-specific options (CRS, delimiter, styling). Process: client-side conversion. Result: auto-download converted file.
