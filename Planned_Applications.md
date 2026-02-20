# NQoS Toolbox - Application Roadmap

This document outlines the prioritized suite of applications for the "NQoS Toolbox".

---

## Category Groups
> These groups are reflected on the landing page (`index.html`). Keep this table in sync when adding or moving apps.

| Category | Badge Color | Apps | Status |
| :--- | :--- | :--- | :--- |
| 🔄 **Conversion** | Orange | Excel to KMZ Converter, KMZ to Excel Converter, KMZ Merger, KML Splitter | ✅ Live (1, 2) · 🗓️ Planned (Merger, Splitter) |
| 🗺️ **Visualization** | Green | KMZ Preview App, KMZ Field Auditor | ✅ Live (Both) |
| 📊 **Analysis** | Blue | Calculate KMZ Overlap, Site Radius Generator, Point-in-Polygon & Distance, Neighbor Relation Auditor, Driving Distance Calculator | ✅ Live (Overlap, Site Radius) · 🗓️ Planned (rest) |

---

## High Priority Applications
These are the core applications scheduled for immediate development.

| Priority | App Name | Category | Use Case | Input | Output |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **HIGH** | **0. Landing Page** | N/A | Central hub to access all tools. | N/A | Navigation |
| **HIGH** | **1. Excel to KMZ Points** | **Convert** | Convert site lists to Google Earth Points. | Excel/CSV (Lat/Long) | .kmz (Placemarks) |
| **HIGH** | **2. KMZ to Excel Converter** | **Convert** | Extract data from KMZ back to Excel. | .kmz / .kml | Excel (Name, Lat, Long) |
| **HIGH** | **3. Calculate KMZ Overlap** | **Analyze** | Calculate overlap of one KMZ on another. | 2 KMZ files | Excel (w/ Coverage %) |
| **HIGH** | **8. KMZ Preview App** | **View** | Lightweight, offline KMZ viewer. Shared core with Auditor. | .kmz / .kml | Map Visualization |
| **HIGH** | **10. KMZ Field Auditor** | **View / Annotate** | Map-based field review driven by Excel. Zoom, verify, annotate. | Excel + Multiple KMZ | Annotated Excel |

## Low Priority / Wishlist
These applications are planned for future phases.

| Priority | App Name | Category | Use Case | Input | Output |
| :--- | :--- | :--- | :--- | :--- | :--- |
| LOW | **3. Point-in-Polygon & Distance** | **Analyze** | Check if point is inside polygon + distance. | Points (Excel) + Polygons (KML) | Excel (Status, Dist) |
| LOW | **4. KMZ Merger** | **Merge/Split** | Combine multiple KMZ files into one. | Multiple .kmz files | Merged .kmz |
| LOW | **5. Site Radius Generator** | **Create** | Draw coverage circles (donuts) around sites. | Excel/CSV (Lat/Long) | KMZ (Circles) |
| LOW | **6. KML Splitter** | **Merge/Split** | Split large KML by column (e.g., City). | Large Excel/CSV | Zip (Multiple KMZs) |
| LOW | **7. Neighbor Relation Auditor** | **Analyze** | Find missing neighbors based on distance. | Sites + Neighbor List | List of Missing Nbrs |
| LOW | **9. Driving Distance Calculator** | **Analyze** | Calculate driving distance and time. | Points (Origins) + Points (Destinations) | Excel (Distance Matrix) |


---

## Shared Settings & Architecture
These settings apply across all applications in the toolbox to ensure a consistent experience.

### 🔌 Offline-First Requirement
> **All apps and the entire project must run fully offline — no internet connection required.**

- All third-party libraries (Leaflet, JSZip, SheetJS, toGeoJSON, Font Awesome, Google Fonts, etc.) must be **vendored locally** under a shared `vendor/` directory and referenced via relative paths — no CDN links.
- Map tile layers must either use a **locally bundled tile set** or a **tile server running on the local machine** (e.g., a simple HTTP server serving MBTiles). A fallback blank/offline tile layer should always be available.
- No API calls to external services (e.g., ArcGIS identify, OSRM routing) should be required for core functionality. Features that depend on external APIs (e.g., satellite imagery date lookup, driving distance) should degrade gracefully with a clear "Requires internet" notice.
- The project must be openable by simply double-clicking `index.html` (or served via a local HTTP server like `npx serve`) — no build step, no Node.js backend, no cloud dependency.

### ⚙️ General Settings
- **Default Map Center**: User-defined Lat/Long for map previews (e.g., Dubai vs New York).
- **Measurement Units**: Metric (Meters/Km) vs Imperial (Feet/Miles).
- **Default Output Prefix**: Custom prefix for generated filenames (e.g., "Converted_").
- **Smart Column Detection**: 
    - Auto-detect if coordinates are in **1 column** (e.g., "25.12, 55.12") or **2 columns** (Lat/Long).
    - Auto-select columns based on headers (avoid misleading names like "Long Shop Code").
    - Support keywords: "GPS", "Coordinates", "Location", "Position", "Lat", "Long".
    - **Important**: If a column cannot be confidently detected, **do not select any** (leave blank/default)

### 🚀 Standard Application Workflow (SPA)
Unless a tool explicitly requires a different approach (e.g. streaming, or map-only views), all tools must follow this 4-step Single Page Application (SPA) workflow, toggling views via JavaScript (`showView`):

1. **Upload View (`#upload-view`)**: Intake via a unified drag-and-drop zone. Validates file type.
2. **Configuration View (`#config-view`)**: Presents all user-configurable parameters (checkboxes, dropdowns mapping to columns). Auto-detects where possible but allows override. Includes a "Cancel" and "Process" button.
3. **Processing View (`#processing-view`)**: Blocks interaction. Shows progress bar and status text. Initiates `JobTracker.start()`.
4. **Result View (`#result-view`)**: Confirms completion. Automatically triggers browser file download (`saveAs()`). Provides a "Download Again" and "Convert another file" button. Closes job with `JobTracker.finish()`.

### 🧰 Shared Components
- **Unified File Inputs (Non-Map Apps)**:
    - [x] `ExcelToKMZ`
    - [x] `KMZtoExcel`
    - [x] `SiteRadiusGenerator`
    - [x] `KMZOverlap`
    - Uses `.file-drop-container` component with `setupUnifiedDropZone` helper.
    - *Note: Map-based apps (`KMZPreview`, `KMZFieldAuditor`) use custom overlays.*


---

## Application Definitions

### 0. Landing Page (`index.html`)
> The central unified dashboard for the NQoS Toolbox.

#### Key Features
- **Unified Dense Grid Layout:** All applications are displayed in a continuous, responsive CSS grid that stretches horizontally across wide monitors, showing up to 6-8 apps per row due to a condensed card size.
- **Categorized Badges & Gradients:** Apps are marked with color-coded badges directly on the cards, along with elegant tinted radial background gradients representing their category.
- **Blueprint Grid Background:** Features a 10px detailed blueprint-style grid background to emphasize the technical "tooling" nature of the suite.
- **Category Filter Bar:** Includes an interactive filter bar below the header to instantly filter the displayed application cards by category (Conversion, Visualization, Analysis).
- **Secret History Access:** The global history page is hidden from the user interface and can only be securely accessed by pressing `Alt + H` while on the landing page, which generates a one-time session token used for access validation.
- **Access Point:** Serves as the primary entry point to all 4-step SPA tools and standalone map views.

### 1. Excel to KMZ Points
> Create a web application called "Excel to KMZ Points". **Workflow:** Standard 4-step SPA. **1. Upload:** Excel or CSV file. **2. Config:** Auto-detect latitude/longitude/coordinate columns and allow manual selection/overrides, allow Grouping by column with intelligent case-preserving aggregation, allow dynamic Visual Icon Selection per group via a floating popup, and Icon Scaling. **3. Process:** Generates a KMZ file where each row is a point placemark. **4. Result:** Auto-downloads the generated `.kmz` file.

### 2. KMZ to Excel Converter
> Build a "KMZ to Excel Converter" tool. **Workflow:** Standard 4-step SPA. **1. Upload:** KMZ/KML file. **2. Config:** Present a configuration screen allowing users to toggle extraction of Description and Altitude, and choose whether to strip HTML from descriptions. **3. Process:** Parses the XML structure to extract all Placemarks into an Excel buffer. **4. Result:** Auto-downloads the formatted Excel file and provides a confirmation screen with a "Download Again" option.

### 3. Calculate KMZ Overlap
> Develop a "Calculate KMZ Overlap" tool. **Workflow:** Standard 4-step SPA. **1. Upload:** Two KMZ files (File A: Coverage/Source, File B: Target/Reference). **2. Config:** Select which file acts as Coverage vs Target. **3. Process:** Calculates spatial overlap locally. **4. Result:** Auto-downloads an Excel file representing File B, appended with a "Coverage %" column.

### 4. Point-in-Polygon & Distance Calculator
> Create a "Point-in-Polygon & Distance Calculator". **Workflow:** Standard 4-step SPA. **1. Upload:** Points (Excel) and Polygons (KML/KMZ). **2. Config:** Match columns. **3. Process:** Calculates if points fall inside polygons locally; if outside, records distance to nearest boundary. **4. Result:** Auto-downloads appended Excel file with results.

### 5. KMZ Merger
> Create a "KMZ Merger" utility. **Workflow:** Standard 4-step SPA. **1. Upload:** Multiple KMZ/KML files. **2. Config:** Option to preserve original folder structures or flatten. **3. Process:** Merges into a single KML document. **4. Result:** Auto-downloads the merged `.kmz`.

### 6. Site Radius/Donut Generator
> Develop a "Site Radius Generator". **Workflow:** Standard 4-step SPA. **1. Upload:** Site list (Excel). **2. Config:** Select Lat/Long columns, input comma-separated radius values (e.g., "500, 1000"). **3. Process:** Generates circular polygons. **4. Result:** Auto-downloads a KMZ file of the drawn circles.

### 7. KML Splitter
> Create a "KML Splitter" tool. **Workflow:** Standard 4-step SPA. **1. Upload:** Large Excel dataset. **2. Config:** Select a "Split By" column (e.g., "City"). **3. Process:** Generates individual KMLs per unique column value. **4. Result:** Auto-downloads a `.zip` file containing multiple KMZs.

### 8. Neighbor Relation Auditor
> Develop a "Neighbor Relation Auditor". **Workflow:** Standard 4-step SPA. **1. Upload:** Site coordinates (Excel) and Neighbor relations (Excel/CSV). **2. Config:** Input threshold distance (e.g., "5km"). **3. Process:** Calculates missing neighbors based on distance. **4. Result:** Auto-downloads Excel list of missing relations.

### 9. KMZ Preview App
> **"KMZ Preview"** — A lightweight, offline viewer for KML/KMZ files.
> **Workflow Exception:** Map-Based SPA. No configuration step. Uploading a file immediately renders it on the map.

#### Overview
Rebuilt on the **shared core** of the KMZ Field Auditor, this preview tool offers a fast, no-frills way to check map files without Google Earth.

#### Key Features
- **Shared Architecture**: Uses the same robust parsing and map logic as the Auditor.
- **Layer Management**:
    - **Drag & Drop**: Load multiple files instantly.
    - **Feature Counts**: See the number of points, polygons, and lines in each layer.
- **Imagery Date**: Persistent "Google Earth-style" date display in bottom-left.
    - **Trigger**: Updates when map movement stops.
    - **Visibility**: Only shown when Satellite layer is active.
    - **Age Context**: Displays time since capture (e.g., "2 years ago").
- **High-Performance Pins**: Custom Canvas-based renderer for 20k+ points.
- **Offline-First**: Zero external dependencies (except tile server if configured).

### 10. Driving Distance Calculator
> Create a "Driving Distance Calculator". **Workflow:** Standard 4-step SPA. **1. Upload:** Two lists of points (Excel). **2. Config:** Select parameters. **3. Process:** Calculates driving distance/time via routing service (Requires Internet). **4. Result:** Auto-downloads Distance Matrix Excel.

### 10. KMZ Field Auditor
> **"KMZ Field Auditor"** app — a map-based field review and annotation tool.

#### Overview
A specialized tool for verifying field data against map locations. It combines the KMZ viewing capabilities of **KMZ Preview** with a guided, row-by-row audit workflow driven by an Excel file.

#### Key Features (Implemented)
- **Always-Visible Audit Panel**: The workflow is driven by a permanent right-side panel (no blocking modals).
- **Inline Configuration**: Load files and configure settings directly in the panel:
    - **Excel File**: The master list to audit.
    - **Lookup Column**: Matches Excel values (e.g., "Site ID") to KMZ feature names.
    - **Target KMZ Layer**: The specific layer to search within.
    - **Annotation Column**: Name for the output column (default: "Audit Note").
- **Live Annotation Stats**: A summary panel shows the **total count** and a breakdown of unique annotations (e.g., "Good: 5, Repair: 2"), sorted by frequency.
- **Smart Audit Workflow**:
    - **Live Progress**: Large counter shows current row / total rows + percentage complete.
    - **Auto-Zoom**: Automatically finds and zooms to the matching feature on the map.
    - **Breathing Highlight**: A pulsing yellow circle highlights the target feature.
- **Inherited Map Features**:
    - **Imagery Date**: Persistent display (Satellite only) with **age context** (e.g., "2 years ago").
    - **Performance**: Canvas-based pin rendering for active layers.
- **Layer Management**: Includes feature counts (pts/polys) per layer.
- **Navigation**: Move between rows using buttons (layout fixed to prevent overflow), **keyboard arrows**, or jump to a specific row number.
- **Enter-to-Advance**: Pressing `Enter` in the note field saves and moves to the next row.
- **Session Persistence**: Current row and annotations are saved to `localStorage` (survives refresh).
- **Offline-First**: Zero external dependencies.

#### Inputs
- **1 Excel file** (.xlsx / .csv).
- **Multiple KMZ/KML files** (drag-and-drop or file picker).

#### Output
- **Annotated Excel File**: The original file with an appended column containing your audit notes.


