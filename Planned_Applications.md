# NQoS Toolbox - Application Roadmap

This document outlines the prioritized suite of applications for the "NQoS Toolbox".

---

## Category Groups
> These groups are reflected on the landing page (`index.html`). Keep this table in sync when adding or moving apps.

| Category | Badge Color | Apps | Status |
| :--- | :--- | :--- | :--- |
| 🔄 **Conversion** | Orange | Excel to KMZ Converter, KMZ to Excel Converter | ✅ Live |
| 🗺️ **Visualization** | Green | KMZ Preview App, KMZ Field Auditor | ✅ Live |
| 📊 **Analysis** | Blue | Calculate KMZ Overlap, Site Radius Generator | ✅ Live |

---

## Live Applications
These are the active core applications currently available in the NQoS Toolbox.

| App Name | Category | Use Case | Input | Output |
| :--- | :--- | :--- | :--- | :--- |
| **0. Landing Page** | N/A | Central hub to access all tools. | N/A | Navigation |
| **1. Excel to KMZ Points** | **Convert** | Convert site lists to Google Earth Points. | Excel/CSV (Lat/Long) | .kmz (Placemarks) |
| **2. KMZ to Excel Converter** | **Convert** | Extract data from KMZ back to Excel. | .kmz / .kml | Excel (Name, Lat, Long) |
| **3. Calculate KMZ Overlap** | **Analyze** | Calculate overlap of one KMZ on another. | 2 KMZ files | Excel (w/ Coverage %) |
| **4. Site Radius Generator** | **Analyze** | Draw coverage circles (donuts) around sites. | Excel/CSV (Lat/Long) | KMZ (Circles) |
| **5. KMZ Preview App** | **View** | Lightweight, offline KMZ viewer. Shared core with Auditor. | .kmz / .kml | Map Visualization |
| **6. KMZ Field Auditor** | **View / Annotate** | Map-based field review driven by Excel. Zoom, verify, annotate. | Excel + Multiple KMZ | Annotated Excel |

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
Unless a tool explicitly requires a different approach (e.g. streaming, or map-only views), all tools must follow this 4-step Single Page Application (SPA) workflow:

1. **Upload View**: Intake via a unified drag-and-drop zone. Validates file type.
2. **Configuration View**: Presents all user-configurable parameters (checkboxes, dropdowns mapping to columns). Auto-detects where possible but allows override. Includes a "Cancel" and "Process" button.
3. **Processing View**: Blocks interaction. Shows progress bar and status text. Initiates background processing.
4. **Result View**: Confirms completion. Automatically triggers browser file download. Provides a "Download Again" and "Convert another file" button. Closes the job.

### 🧰 Shared Components
- **Unified File Inputs (Non-Map Apps)**:
    - [x] Excel to KMZ Points
    - [x] KMZ to Excel Converter
    - [x] Site Radius Generator
    - [x] Calculate KMZ Overlap
    - Uses a standard file drop zone component.
    - *Note: Map-based apps use custom overlays.*



---


---


---

## 📄 Templates

The NQoS Toolbox architecture is built upon a set of standardized components and styling patterns to ensure a professional and unified experience.

### 1. Core UI Components
These visual building blocks are used consistently across all tools:
- **Navbar Brand image**: The navbar should always use an image logo wrapped in a `.brand` anchor, specifically: `<img src="../assets/logo.png" alt="NQoS Tools" class="brand-logo">`
- **Navigation Cards**: Clickable, elevated cards used on the landing page for tool selection.
- **Configuration Panels**: A standardized layout applied universally across all SPA tools. Features a clean white card background with subtle shadows and rounded corners. Inside, related settings are intuitively grouped into distinct light-gray sub-blocks with consistent padding, paired with highly consistent header typography and a symmetrically aligned action toolbar.
- **Result Screens**: A clear, results-focused layout featuring a large success icon, a prominent heading, a dedicated summary paragraph for transparent numeric output, and symmetrically aligned action buttons to download or restart.
- **Action Buttons**: Highly visible primary buttons used to execute core tasks (e.g., "Convert").
- **Upload Zones**: Standard drag-and-drop areas displaying an icon, a browse button, and the selected file name.

### 2. The 4-Step SPA Workflow
All new standard tools follow this consistent flow, toggling these primary views seamlessly:
1. **Upload**: Uses the unified Upload Zone for file intake and type validation.
2. **Configuration**: Displays the Configuration Panel for user settings and ends with a clear Action Button.
3. **Processing**: Locks the interface and shows a clean, centered progress bar during background tasks.
4. **Result**: Confirms completion, automatically triggers the file download, and offers options to restart.

---


---

## Application Definitions

### 0. Landing Page (`index.html`)
> The central unified dashboard for the NQoS Toolbox.

#### Key Features
- **Unified Flexbox Layout:** All applications are displayed in a responsive CSS flexbox layout that stretches up to 95% horizontally across wide monitors, showing wider and consistently sized application cards.
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


### 4. Site Radius/Donut Generator
> Develop a "Site Radius Generator". **Workflow:** Standard 4-step SPA. **1. Upload:** Site list (Excel). **2. Config:** Select Lat/Long columns, input comma-separated radius values (e.g., "500, 1000"). **3. Process:** Generates circular polygons. **4. Result:** Auto-downloads a KMZ file of the drawn circles.


### 5. KMZ Preview App
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


### 6. KMZ Field Auditor
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


