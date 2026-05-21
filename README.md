<div align="center">

<img width="940" height="322" alt="BeckaRepo" src="https://github.com/user-attachments/assets/f8121a84-f34d-4cb8-9a1d-62af6a851dd7" />


### Repository Architecture Visualization & Dependency Mapping Engine

BeckaRepo transforms complex repositories into dynamic relational graphs, allowing developers and software architects to visually explore project structure, dependencies, hierarchy, and information flow in real time.

---

![Electron](https://img.shields.io/badge/Desktop-Electron-2b2e3a?style=for-the-badge&logo=electron&logoColor=9feaf9)
![React](https://img.shields.io/badge/Frontend-React_19-20232a?style=for-the-badge&logo=react&logoColor=61dafb)
![Vite](https://img.shields.io/badge/Build_Tool-Vite-646cff?style=for-the-badge&logo=vite&logoColor=fff)
![D3.js](https://img.shields.io/badge/Visualization-D3.js-f9a03c?style=for-the-badge&logo=d3.js&logoColor=fff)
![NodeJS](https://img.shields.io/badge/Runtime-Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=fff)

</div>

---

# Overview

BeckaRepo is a desktop application focused on **repository architecture visualization**, **dependency analysis**, and **code relationship mapping**.

Instead of manually navigating folders and tracing imports across hundreds of files, BeckaRepo generates an interactive graph representation of the repository structure, helping developers quickly understand:

- Project hierarchy
- File relationships
- Dependency coupling
- Architecture flow
- Impact propagation
- Legacy system structure

The application was designed to simplify exploration of large and complex codebases through an intuitive and scalable visual interface.

---

# System Architecture

BeckaRepo follows a hybrid desktop architecture that separates interface rendering from repository analysis and system-level operations.

---

## Desktop Layer  
### `Electron Main Process`

The desktop layer is built with **Electron**, providing:

- Native desktop window management
- Local filesystem access
- OS-level API integration
- Application lifecycle orchestration

This layer acts as the bridge between the operating system and the visualization engine.

---

## Interface Layer  
### `React Renderer Process`

The frontend is developed using **React 19** and powered by **Vite** for ultra-fast module loading and optimized rendering performance.

The interface is responsible for:

- Repository navigation
- Dynamic graph interaction
- State management
- Search systems
- Real-time visual updates

---

## Graph Visualization Engine  
### `D3.js Adaptive Renderer`

At the core of BeckaRepo is an adaptive graph-rendering engine powered by **D3.js**.

The renderer dynamically changes strategy depending on repository scale:

| Rendering Mode | Usage |
|---|---|
| **SVG Mode** | Small and medium repositories with high interactivity |
| **Canvas Mode** | Large-scale repositories with thousands of nodes and edges |

This hybrid approach guarantees both visual fidelity and scalability.

---

# Core Features

## Dependency Parsing Engine

BeckaRepo includes a custom-built parser capable of analyzing dependencies across multiple programming languages and ecosystems.

### Supported Technologies

- JavaScript
- TypeScript
- Python
- Go
- C#
- Rust
- Infrastructure files
- Docker environments
- CI/CD configurations

The engine applies heuristic analysis to identify relationships between:

- Source files
- Assets
- Modules
- Configuration files
- Build systems

---

## Term Graph  
### Semantic Repository Search

Unlike traditional text-based search systems, BeckaRepo reconstructs a **focused dependency graph** based on the searched term.

Instead of simply listing matching files, the engine isolates and visualizes only the entities directly connected to the searched context.

This allows developers to:

- Visualize impact propagation
- Understand architectural relationships
- Detect hidden dependencies
- Analyze coupling between systems

---

## Persistent Metadata System

The application uses Electron-integrated browser storage to persist:

- Repository notes
- Custom tags
- Architecture annotations
- Developer metadata

This enables architectural knowledge retention between sessions.

---

# Performance Strategy

BeckaRepo was designed with scalability as a core principle.

### Optimization Techniques

- Adaptive rendering pipeline
- Dynamic graph pruning
- Lazy visual updates
- Hardware-accelerated canvas rendering
- Incremental graph reconstruction

These strategies allow the application to remain responsive even when processing extremely large repositories.

---

# Development Setup

## Clone the Repository

```bash
git clone <repository-url>
```

---

## Install Dependencies

```bash
npm install
```

---

## Start Development Environment

```bash
npm run dev
```

This launches:

- Vite Development Server
- Electron Desktop Process

---

## Build Executable Installer

```bash
npm run build:exe
```

---

# Vision

BeckaRepo was created to help developers better understand:

- Legacy systems
- Enterprise architectures
- Monorepositories
- Large-scale applications
- Deep dependency structures

The project focuses on reducing onboarding friction and accelerating architectural comprehension through visual exploration.

---

# Future Goals

- AI-assisted architecture analysis
- Dependency risk detection
- Repository clustering
- Multi-repository visualization
- Live architecture monitoring
- Collaborative graph annotations

---

<div align="center">

# Credits

Created with passion for software engineering, visualization systems, and developer experience.

### Message to Rebecka

> *"From one friend to another."*

</div>
