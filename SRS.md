# Software Requirements Specification
## Frontend Constructor (No-code UI)

---

### Authors
- **Chebotareva Anna Vladimirovna**, 23215
- **Dunaev Artemii Aleksandrovich**, 23215
- **Rebrin Sergey Aleksandrovich**, 23215
- **Khubanov Ochir Valentinovich**, 23216

---

## 📐 System Architecture

### High-Level Architecture Diagram

```mermaid
graph TB
    subgraph ElectronApp["🖥️ Electron Application"]
        subgraph Backend["Backend (Main Process)"]
            FS[📁 File System<br/>Read/Write/Watch]
            Dialogs[💬 Native Dialogs]
        end
        
        Bridge[🔒 Security Bridge<br/>contextBridge]
        
        subgraph Frontend["Frontend (Renderer Process)"]
            UI[🎨 React UI<br/>File Tree + Editors]
            
            subgraph Editor["Visual Editor"]
                Preview[👁️ Preview iframe<br/>Instrumented Code]
                BlockPanel[🧱 Block Editor<br/>Style/Props Panel]
            end
            
            Parser[⚡ Manual Parser<br/>HTML/JSX/TSX]
            PatchSys[📦 Patch System<br/>Staged Changes]
        end
    end
    
    User[👤 User/Creator] --> UI
    
    UI --> Parser
    Parser -->|blockMap + IDs| Preview
    Preview <-->|MRPAK Protocol| BlockPanel
    
    BlockPanel --> PatchSys
    PatchSys -->|Save| Bridge
    
    Bridge <-->|IPC| FS
    Bridge <-->|IPC| Dialogs
    
    FS <--> Files[📄 Project Files<br/>100% Format Preserved]
    
    style Backend fill:#e8f5e9
    style Frontend fill:#e3f2fd
    style Bridge fill:#fff9c4
    style Editor fill:#f3e5f5
    style Files fill:#fce4ec
```

**Key Components:**
- **Backend**: Node.js-based file system operations
- **Frontend**: React-based visual editor
- **Parser**: Manual parsing (10x faster than Babel)
- **Patch System**: Accumulates changes before saving
- **MRPAK Protocol**: iframe ↔ parent communication

> 📖 **Detailed Architecture**: See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for comprehensive diagrams

---

## 1. Introduction

**Frontend Constructor (No-code UI)** is a web application for visually assembling user interfaces without code. The user (Creator) works on a canvas: adds ready-made components (buttons, cards, inputs), manages layers and groups, edits properties and styles, configures project design tokens (colors, typography, spacing), views responsive preview (desktop/tablet/mobile), imports projects by path and supports real-time code updates.

---

## 2. Glossary

| Term | Definition |
|------|------------|
| **Canvas** | The editor's workspace where components are placed. |
| **Component** | A UI element (Button, Input, Image, Card, etc.) with parameters and styles. |
| **Layer** | An item in the layer tree; defines stacking order (z-order), visibility, locking. |
| **Group** | A set of components for joint move/resize. |
| **Design tokens** | Global variables (colors, fonts, sizes, shadows) applied across the project. |
| **Breakpoint** | A preset size for responsive layouts (mobile/tablet/desktop). |
| **Component variant** | A predefined style/state (primary/secondary, hover/focus…). |
| **Preview** | Interactive view with device switching, without external backend. |

---

## 3. Actors

### 3.1 Creator
- **Role:** Designs interfaces, manages projects, exports/publishes output.
- **Goals:** Rapidly assemble UI from building blocks, tune styles/responsiveness, obtain clean code.

---

## 4. Functional Requirements

### 4.1 Use Cases

#### **UC-1-1: Create New Project**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Start a new project in the editor |
| **Precondition** | Website is open |
| **Trigger** | User clicks "Create New UI" |
| **Extensions** | UC-1-2 — Project Settings (optional setup after creation) |

**Main Success Scenario:**
1. User selects "Create New UI"
2. The system opens an empty canvas
3. The Component Library and Layers panels become available
4. User optionally selects a starter template

**Alternative Scenario:** `<Storage Unavailable>`
- **Trigger:** Local storage (file system / IndexedDB) unavailable
- System shows a warning: "Storage unavailable"
- User continues working without saving capability

**Notes:**
- Starter templates may be used to speed up the initial setup

---

#### **UC-1-2: Project Settings**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Set theme tokens, breakpoints, grids, and constants |
| **Precondition** | A project is open |
| **Trigger** | User clicks "Settings" |

**Main Success Scenario:**
1. The settings module opens
2. User edits theme tokens, breakpoints, and grid parameters
3. User clicks "Apply & Save"
4. The system updates workspace and layout accordingly

**Alternative Scenario:** `<Changes Not Applied>`
- **Trigger:** User closes settings without saving
- Changes are discarded
- Workspace remains unchanged

---

#### **UC-1-3: Adding a Component**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Place a new component on the canvas |
| **Precondition** | Canvas is open |
| **Trigger** | User drags a component from the library or uses click-to-insert |

**Main Success Scenario:**
1. Component appears on the canvas
2. Component automatically snaps to grid or alignment guides
3. Its properties and styles are editable in the side panel
4. A new element is added to the code

**Alternative Scenario:** `<Limit Exceeded>`
- **Trigger:** Memory or element limit reached
- System shows a warning: "Limit exceeded"
- Component is not added

---

#### **UC-1-4: Deleting Components**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Delete a selected component |
| **Trigger** | User selects component → presses "Delete" → confirms |

**Main Success Scenario:**
1. System removes the component from the canvas
2. Related groups and hierarchies are updated
3. The element is removed from the code

---

#### **UC-1-5: Moving/Aligning Components**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Change component position or alignment |
| **Trigger** | User drags a component, uses arrow keys, or changes position via side panel |

**Main Success Scenario:**
1. Component moves across the canvas
2. Snaplines and alignment guides appear
3. Position is updated and saved

**Alternative Scenario:** `<Out of Bounds>`
- **Trigger:** Component moved beyond canvas limits
- Movement stops or canvas autoscrolls
- If constraints are violated, position reverts and warning appears

---

#### **UC-1-6: Editing Properties/Styles**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Adjust content, variants, styles, auto-layout, or pins |
| **Trigger** | User selects a component |

**Main Success Scenario:**
1. The side panel opens automatically
2. User edits component properties and styles
3. Changes are saved and reflected on the canvas

**Alternative Scenario:** `<Invalid Value>`
- **Trigger:** Invalid data entered in a property field
- Field is highlighted in red
- System rejects the invalid value

---

#### **UC-1-7: Layers & Z-Order**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Manage stacking order, visibility, and locking of components |
| **Trigger** | User interacts with the Layers panel or context menu |

**Main Success Scenario:**
1. User reorders, locks/unlocks, or shows/hides layers
2. The canvas updates accordingly

**Alternative Scenario:** `<Locked Layer>`
- **Trigger:** Attempt to modify locked layer
- System shows a warning: "Layer locked"
- Action is blocked

---

#### **UC-1-8: Grouping/Ungrouping Components**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Build compound elements via grouping |
| **Trigger** | User selects multiple elements → chooses "Group" / "Ungroup" |

**Main Success Scenario:**
1. The group is created or removed
2. Grouped elements transform jointly
3. The elements are moved to a component in the code

**Alternative Scenario:** `<Auto-Layout Conflict>`
- **Trigger:** Grouping conflicts with auto-layout rules
- The system prompts users to simplify or detach auto-layout

---

#### **UC-1-9: History (Undo/Redo)**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Revert or reapply previous actions |
| **Trigger** | User presses `Ctrl+Z` / `Ctrl+Shift+Z` or clicks toolbar buttons |

**Main Success Scenario:**
1. Canvas updates to the previous or next state
2. History stack adjusts accordingly

**Alternative Scenario:** `<Empty History>`
- **Trigger:** No actions to undo/redo
- The system performs no operation

---

#### **UC-1-10: Canvas Navigation**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Pan or zoom within the workspace |
| **Trigger** | User drags the background, scrolls the mouse wheel, or uses zoom controls |

**Main Success Scenario:**
1. Canvas pans or zooms smoothly
2. User can fit the view to screen, width, or breakpoint preset

**Alternative Scenario:** `<Zoom Limit>`
- **Trigger:** Minimum or maximum zoom reached
- Further zooming disabled

---

#### **UC-1-11: Importing a Project**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | Load a project from a local file |
| **Trigger** | User clicks "Load Project" |

**Main Success Scenario:**
1. User selects a valid project directory
2. Canvas, components, and layers are restored
3. Theme tokens and breakpoints applied

**Alternative Scenario:** `<Invalid Format>`
- **Trigger:** Not found `index.html`
- System displays an error message: "Invalid project directory"

---

#### **UC-1-12: Responsive Preview**

| Field | Value |
|-------|-------|
| **Actors** | Creator |
| **Goals** | View UI across device presets (Desktop, Tablet, Mobile) |
| **Trigger** | User clicks "Preview" |

**Main Success Scenario:**
1. Preview mode opens
2. User switches between device presets and orientations
3. Hover/focus/pressed states can be inspected

**Alternative Scenario:** `<Missing Assets>`
- **Trigger:** Linked images or fonts unavailable
- System displays warnings
- Preview stops for affected elements

---

## 5. System-wide Functional Requirements

### FR-1. Real-time Preview and Synchronization
The system shall provide real-time synchronization between the drag-and-drop interface and the code editor. All changes made in the visual editor must be instantly reflected in the code panel, and vice versa.

### FR-2. Undo/Redo System
The system shall support undo and redo operations for user actions. The action history must be preserved during the current session.

### FR-3. Cross-platform Preview
The system shall allow users to switch between Desktop, Tablet, and Mobile preview modes. Style changes must be stored and applied according to the selected platform.

### FR-4. Component Hierarchy Visualization
The system shall display the component structure as a hierarchical tree. Selecting an element in the workspace shall highlight it both in the tree view and in the code editor.

### FR-5. Project-wide and Local Styling
The system shall allow editing both global project styles and individual component styles. All applied styles must be preserved and reflected in the exported code.

### FR-6. Error Handling and Validation
The system shall validate imported code and project structure. In case of errors, the user shall receive a descriptive message, and the system shall attempt to auto-correct or highlight the issue.

### FR-7. Plugin and Extension Support (optional)
The system architecture shall support the addition of plugins or extensions to enhance functionality (e.g., new UI components or templates).

### FR-8. Audit and Autosave
The system shall automatically save project changes at defined intervals. The user shall be able to access the project version history and restore previous versions if needed.

---

## 6. Non-functional Requirements

### 6.1 Environment

**Client Requirements:**
- Modern browsers (last 2 versions) — Chrome, Edge, Firefox, Safari
- Pointer Events support
- LocalStorage/IndexedDB

**Recommended Stack:**
- TypeScript, React
- Vite/Next (SPA/MPA)
- CSS-in-JS or CSS Modules
- Redux for state management

**Export Formats:**
- Static HTML/CSS (+ assets)
- React components
- Design Tokens (JSON/CSS variables)

**Storage:**
- Local (IndexedDB/FS API/file system)

---

### 6.2 Performance

| Metric | Target |
|--------|--------|
| **Canvas interactions** | Instantaneous feel for up to ~200 components |
| **Undo/Redo operations** | Complete within < 0.3 seconds |
| **Project loading/exporting** | Few seconds for up to 5 MB on modern hardware |
| **Canvas rendering** | Stable 60 fps on mid-range devices during pan/zoom |

---

### 6.3 Reliability

| Metric | Target |
|--------|--------|
| **Availability** | 99.5% monthly (if preview server exists) |
| **Autosave** | Every 30–60 seconds and on critical actions |
| **Error handling** | Clear user messages; safe degradation (no data loss) |
| **Recovery time** | ≤ 5 seconds to restore local version after crash |

---

### 6.4 Extensibility

**Extension Points:**
- Component library (registry) — declarative props/styles/variants
- Exporters (pipeline) — interfaces for multiple formats
- Validators — pluggable quality/accessibility rules

**Compatibility:**
- Backward compatible project format for minor versions
- Migrations for major updates

**Scalability:**
- Support thousands of layers via tree/canvas virtualization

**Configurability:**
- Feature flags, editor themes, hotkeys

---

### 6.5 File Structure Preservation

> **Core Principle:** The system shall maintain 100% of the original file structure

#### What is Preserved:
- ✅ Code formatting (indentation, spacing, line breaks)
- ✅ Comments (single-line, multi-line, JSDoc)
- ✅ Developer coding style (quotes, semicolons, etc.)
- ✅ File organization and imports order

#### Preservation Technique: Manual Parsing Without AST Transformation

The system uses **lightweight manual parsing** instead of heavy AST parsers (Babel, TypeScript) to:

| Benefit | Details |
|---------|---------|
| ⚡ **Performance** | Parse code **10x faster** than traditional parsers |
| 🪶 **Size** | Reduce bundle size by **40x** compared to Babel |
| ✅ **Formatting** | Preserve original formatting without modification |
| 🎯 **Precision** | Apply changes as surgical patches to original code |

#### Implementation Approach:

**HTML files:**
- Use browser's native `DOMParser` for reliable HTML parsing
- Leverage built-in browser capabilities

**JSX/React files:**
- Character-by-character manual parsing with context tracking
- State machine implementation

**Modification strategy:**
- Direct string manipulation at exact positions
- Code instrumentation: Add tracking IDs without reformatting

#### Performance Comparison:

| Metric | Traditional (Babel) | No-code UI |
|--------|---------------------|------------|
| **Parse time** | 150ms | **15ms** ⚡ |
| **Bundle size** | 2MB | **50KB** 🪶 |
| **Format preservation** | ❌ Lost | ✅ **100%** |

#### Key Features:

- **String literals handling:** Skip content inside quotes (`"..."`, `'...'`, `` `...` ``)
- **Comment preservation:** Ignore code inside `//` and `/* */` comments
- **Template literal support:** Handle `${expressions}` within backticks
- **Nested expressions:** Track depth of `{...}` and `(...)` brackets
- **Self-closing tags:** Properly detect `<Tag />` vs `<Tag></Tag>`

#### Unique Identification System:

**HTML elements:**
```
Format: mrpak:{filename}:{tagName}:{cssSelector}
Example: mrpak:index.html:div:body > div:nth-child(1) > section
```

**JSX elements:**
```
Format: mrpak:{filename}:{startPos}:{endPos}:{tagName}
Example: mrpak:App.jsx:245:312:View
```

**Update mechanism:** Rebuild ID map on file changes (10ms operation)

#### Patch Application:

1. System accumulates changes as "patches" before saving
2. Each patch contains: target element ID, property, old value, new value
3. On save: Apply all patches sequentially to original file content
4. Validation: Verify patch application success before writing to disk
5. Atomic writes: Use temporary files + rename for safe file updates

#### Error Recovery:

| Scenario | Response |
|----------|----------|
| **Patch fails** | Reject change, notify user, preserve original file |
| **External modification** | Detect via file watcher, reload and warn user |
| **Backup system** | Optional `.mrpak.bak` files before modifications |
| **Auto-save** | Periodic saves every 30-60 seconds |

#### Supported File Types:

| Type | Support Level | Details |
|------|---------------|---------|
| **HTML** (.html) | ✅ Full support | Inline styles and scripts |
| **JSX** (.jsx) | ✅ Full support | React components with manual JSX parsing |
| **TSX** (.tsx) | ✅ Full support | TypeScript JSX with type annotation skipping |
| **React Native** (.jsx) | ✅ Full support | StyleSheet and React Native components |
| **CSS** (.css) | ✅ Full support | CSS rule parsing and modification |
| **JSON** (.json) | ✅ Full support | Design tokens and configuration |
| **TypeScript** (.ts) | ⚠️ Limited | Displayed but not editable visually |
| **JavaScript** (.js) | ⚠️ Limited | Displayed but limited visual editing |
| **Markdown** (.md) | ⚠️ View only | Text view only |

#### Limitations:

- ⚠️ Complex TypeScript generics may cause parsing issues
- ⚠️ Dynamic component generation (factories) not visually editable
- ⚠️ Conditional JSX with complex ternaries may be partially supported
- ⚠️ Code minification/obfuscation breaks visual editing

#### Trade-offs:

| Aspect | Choice |
|--------|--------|
| **Coverage** | 95% use case coverage vs 100% with full AST parser |
| **Performance** | Significantly faster and lighter vs slightly less robust |
| **Philosophy** | Preserves developer intent vs enforcing style consistency |

---

## 7. Technical Implementation Details

### 7.1 File Structure Preservation Architecture

#### 7.1.1 Parsing Pipeline

The system implements a **three-stage parsing pipeline:**

##### Stage 1: File Reading
1. Read file content as UTF-8 text string
2. Create file metadata (path, size, modification time)
3. Initialize empty `blockMap` for element tracking

##### Stage 2: Instrumentation
1. Insert `data-no-code-ui-id` attributes into elements
2. Build `blockMap`: ID → element position mapping
3. Preserve original formatting during insertion
4. Track string/comment/code contexts to avoid false positives

##### Stage 3: Rendering
1. Transform instrumented code for preview
2. Handle framework-specific requirements (React/HTML/RN)
3. Inject editor scripts for interactive manipulation
4. Display in isolated iframe for security

---

#### 7.1.2 Manual Parsing Algorithm (JSX)

The JSX parser implements a **state machine approach:**

```javascript
State variables:
- position: current character index
- inString: null | '"' | "'" | '`'
- inComment: null | 'line' | 'block'
- bracketDepth: number of nested {...}
- parenDepth: number of nested (...)

Algorithm:
for each character at position:
  if inComment:
    if found comment end → inComment = null
    continue
  
  if inString:
    if found string end → inString = null
    continue
  
  if found string start → inString = type
  if found comment start → inComment = type
  
  if found '<' and not in string/comment:
    if next char is letter/underscore:
      parse tag name
      parse attributes (track bracket depth)
      find tag end (> or />)
      insert data-no-code-ui-id after tag name
      record in blockMap
```

---

#### 7.1.3 ID Generation Strategy

##### HTML Elements:
- **Format:** `mrpak:{filename}:{tagName}:{cssSelector}`
- **Example:** `mrpak:index.html:div:body > div:nth-child(1) > section`
- **Generation:** Walk DOM tree, build selector for each element
- **Stability:** Changes when DOM structure modified

##### JSX Elements:
- **Format:** `mrpak:{filename}:{startPos}:{endPos}:{tagName}`
- **Example:** `mrpak:App.jsx:245:312:View`
- **Generation:** Record character positions during parsing
- **Stability:** Changes when code above element modified

##### Benefits:
- ✅ Guaranteed uniqueness (no ID collisions)
- ✅ Fast lookup (O(1) hash map access)
- ✅ Reversible (can find element from ID)
- ✅ Stable within single edit session

---

#### 7.1.4 Patch System Architecture

##### Patch Structure:

```javascript
{
  type: 'SET_STYLE' | 'SET_TEXT' | 'INSERT' | 'DELETE' | 'REPARENT',
  blockId: 'mrpak:App.jsx:150:180:View',
  property: 'backgroundColor',
  oldValue: '#ffffff',
  newValue: '#000000',
  timestamp: 1703001234567
}
```

##### Patch Accumulation:
1. User makes change in visual editor
2. System creates patch object
3. Patch added to staged patches array
4. Visual preview updated immediately
5. File remains unchanged until save

##### Patch Application (on save):
1. Load original file content
2. Sort patches by position (bottom-to-top)
3. Apply each patch:
   - Locate target element by ID
   - Verify old value matches (conflict check)
   - Replace with new value
   - Update positions for remaining patches
4. Validate result (syntax check)
5. Write to temporary file
6. Rename temp file to original (atomic)
7. Update file watcher timestamp

##### Conflict Resolution:

If file modified externally during editing:
- 🔍 Detect via file watcher
- ⚠️ Show warning to user
- 🔀 Offer options: discard changes / force save / manual merge
- 🎯 Highlight conflicting elements

---

#### 7.1.5 Format Preservation Techniques

##### Whitespace Preservation:
- Track exact character positions for insertions
- Detect indentation style (tabs vs spaces)
- Match existing indentation when adding attributes
- Preserve blank lines between elements

##### Comment Preservation:
- Never parse inside comment blocks
- Maintain comments in original positions
- Support JSDoc, single-line, and multi-line comments
- Preserve comment formatting and alignment

##### Quote Style Preservation:
- Detect existing quote style (`"` vs `'`)
- Use same style for new attributes
- Don't change existing quotes
- Support mixed quote styles in same file

##### Semicolon Preservation:
- Don't add or remove semicolons
- Match existing semicolon usage
- Preserve developer's style preference

##### Line Break Preservation:
- Keep original line break style (LF vs CRLF)
- Don't reflow long lines
- Preserve multi-line attribute formatting
- Maintain JSX expression formatting

---

#### 7.1.6 Performance Optimizations

##### Lazy Parsing:
- Parse only when file opened
- Cache `blockMap` for open files
- Invalidate cache on file change
- Rebuild only affected portions when possible

##### Incremental Updates:
- For small changes: patch in-memory representation
- For large changes: full reparse (still fast at 15ms)
- Debounce rapid changes (300ms window)
- Batch multiple patches into single file write

##### Memory Management:
- Store only essential data in `blockMap`
- Release resources when file closed
- Limit history depth (50 entries default)
- Compress old history entries

##### Concurrent Operations:
- Use Web Workers for parsing large files (optional)
- Non-blocking file operations (async/await)
- Progressive rendering for large DOMs
- Virtualized component tree for performance

---

### 7.2 Example: Style Change Workflow

#### Original file (App.jsx):

```jsx
function App() {
  return (
    <View style={{ color: 'red' }}>
      <Text>Hello</Text>
    </View>
  );
}
```

#### After instrumentation:

```jsx
function App() {
  return (
    <View data-no-code-ui-id="mrpak:App.jsx:45:89:View" style={{ color: 'red' }}>
      <Text data-no-code-ui-id="mrpak:App.jsx:56:78:Text">Hello</Text>
    </View>
  );
}
```

#### User changes color to 'blue' in visual editor:

**Patch created:**

```javascript
{
  type: 'SET_STYLE',
  blockId: 'mrpak:App.jsx:45:89:View',
  property: 'color',
  oldValue: 'red',
  newValue: 'blue'
}
```

#### On save, patch applied to original file (without IDs):

```jsx
function App() {
  return (
    <View style={{ color: 'blue' }}>
      <Text>Hello</Text>
    </View>
  );
}
```

> **Result:** Only color changed, formatting preserved 100% ✅

---

### 7.3 Comparison with Traditional Approaches

#### Traditional AST Approach:

1. Parse with Babel (150ms)
2. Generate full AST tree (complex structure)
3. Traverse tree to find element
4. Modify AST node
5. Generate code from AST (loses formatting)
6. Write to file

**Total:** 200ms, 2MB bundle, ❌ formatting lost

---

#### No-code UI Approach:

1. Manual parse (15ms)
2. Build simple `blockMap` (lightweight)
3. Find element by ID (O(1) lookup)
4. Create patch object
5. Apply patch to original string
6. Write to file

**Total:** 20ms, 50KB bundle, ✅ formatting preserved

---

### 📊 Summary Comparison

| Aspect | Traditional AST | No-code UI | Winner |
|--------|-----------------|------------|--------|
| **Speed** | 200ms | 20ms | 🏆 **10x faster** |
| **Size** | 2MB | 50KB | 🏆 **40x smaller** |
| **Format** | Lost | Preserved | 🏆 **100% preserved** |

---

## 📝 Document Information

- **Version:** 1.0
- **Last Updated:** December 2024
- **Status:** Active Development
- **Project:** No-code UI (Frontend Constructor)

