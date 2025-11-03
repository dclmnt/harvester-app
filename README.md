# Harvester App

A forestry pricing assistant that ingests harvester production reports (HPR files), groups stems by diameter (DBH) and species, and compares your legacy single-bin pricing against a modern per-bin model. The interface is built with React, TypeScript, Vite, and Tailwind CSS for fast iteration in the field.

## How the app works

1. **Upload HPR data** – Drag and drop or browse for one or more `.hpr` or `.zip` files. The parser extracts stems, logs, diameter classes, and species information, automatically combining multiple uploads into a single dataset.
2. **Tune operational inputs** – Adjust harvesting and forwarding rates, skidding distance, stand removal, and advanced constants (k1, k2, c11, max per-tree time) to reflect the stand and machine configuration.
3. **Maintain price lists** – Enter or paste the legacy price table based on average stem volume and fine-tune the divisor table per species/DBH class in the admin view.
4. **Analyse results** – Run the calculator to see volume, price, and value per species and DBH class, compare totals between the new per-bin model and the legacy model, and export the results to Excel for sharing with stakeholders.

## Language support

- The interface ships with **Swedish (default)** and **English** translations. Use the toggle in the header to switch languages instantly.
- All domain-specific forestry terminology used in the UI has been crafted by the team to match Scandinavian harvesting practices.

## Getting started

### Prerequisites
- Node.js 18 or later
- npm 9+

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```
Open the local URL printed in the terminal (default `http://localhost:5173`) to use the app.

### Production build

```bash
npm run build
npm run preview
```

## Tech stack

- React + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui component primitives
- Vercel Analytics

## Ownership and project background

Harvester App and all language assets within the interface are owned by the creators listed below. The application was developed as part of a project at **Linnaeus University**.

## Creators

- [Daniel Clemente](https://www.linkedin.com/in/danielbengevenga/)
- [Nadia Zalika](https://www.linkedin.com/in/nadia-zalika/)
- [Daniella Lundqvist](https://www.linkedin.com/in/daniella-lundqvist-859379178/)

The team retains full ownership of the application and its forestry terminology.
