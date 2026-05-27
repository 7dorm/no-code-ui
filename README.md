# No-Code UI

A visual, web-based code editor for React and React Native Web components. It provides a split-view interface allowing developers to seamlessly switch between visual block editing and direct source code manipulation.

## Features

- **Split View Editor**: Work with visual blocks and raw code side-by-side. Changes sync automatically.
- **Visual Block Inspector**: Edit styles, positions, and text content directly from a properties panel without touching code.
- **Monaco Editor Integration**: Fully-featured code editing experience powered by VS Code's editor engine.
- **Robust History System**: Built-in Undo/Redo tracking for all changes (both visual and code-based).
- **React Native Web Support**: Render and edit React Native components directly in the browser.
- **Live Preview**: Real-time iframe-based rendering of the components.

## Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **State Management**: Zustand
- **Code Editor**: Monaco Editor (`@monaco-editor/react`)
- **AST Parsing**: `@babel/parser`, `@babel/traverse`, `ts-morph`
- **Compatibility**: React Native Web

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn

### Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173` (or the port specified by Vite).

## Project Structure

- `src/features/editor`: Contains the core logic for the visual editor, including block manipulation, AST parsing, and state management.
- `src/shared/ui`: Reusable UI components used across the application.
- `src/AppRN.tsx`: The main entry point for the application interface.

## License

MIT
