# Saan Punta — Commute Route Finder & Fare Calculator

**Saan Punta** is a static React (Vite) point-to-point public transport commute route finder tailored for destinations around the **Pamantasan ng Lungsod ng Valenzuela (PLV)** and surrounding Metro Manila areas. 

It calculates travel paths across multiple transport modes (jeepneys, tricycles, trains, taxis, motorcycle taxis, walking) using a graph traversal algorithm, rendering the route on an interactive OpenStreetMap (Leaflet) map accompanied by detailed, step-by-step fare cards.

---

## ⚠️ Important Disclaimer

- **Estimates Only:** All fares displayed are estimates based on published LTFRB rate matrices as of **March 2026** and may not reflect actual fares, driver rounding, locally negotiated rates, or future tariff hikes.
- **Taxis:** Fares are computed via distance formula (`₱45 base + ₱13.50/km`) and are flagged as *regulated but variable by traffic conditions*.
- **Motorcycle Taxis (MoveIt / Angkas):** Prices are represented solely as **wide estimate ranges** (min-max). They are *rough estimates, not sourced from any official rate table*, and surge pricing will apply in real-world scenarios.
- **Manual Curation:** Routes and locations are manually curated for the PLV/Valenzuela area. Only legs defined in `routes.json` are processed.

---

## 🛠️ Data Structure (`routes.json`)

To add, edit, or customize locations (nodes) and transport connections (legs), modify the [routes.json](file:///src/data/routes.json) file located at `src/data/routes.json`. 

### Nodes (Locations)
Each node represents a named transit hub or destination, requiring unique IDs and exact coordinate bindings for the map rendering.
```json
{
  "id": "plv",
  "name": "Pamantasan ng Lungsod ng Valenzuela (PLV)",
  "lat": 14.6993,
  "lng": 120.9754
}
```

### Legs (Connections)
Legs connect two nodes together and specify the transit mode, route details, distance, and fare model.
```json
{
  "id": "leg-1",
  "from": "plv",
  "to": "val_city_hall",
  "mode": "jeepney",
  "route_name": "Malanday - Monumento",
  "distance_km": 2.2,
  "fare_type": "traditional",
  "notes": "Traditional jeepney ride along McArthur Highway."
}
```

#### Leg Fields Guide
- `id` *(string)*: Unique identifier for the leg (e.g., `leg-1`, `leg-2`).
- `from` *(string)*: Starting Node ID matching a node in the `nodes` list.
- `to` *(string)*: Destination Node ID matching a node in the `nodes` list.
- `mode` *(string)*: Must be one of: `"jeepney" | "tricycle" | "taxi" | "moto_taxi" | "train" | "walk"`.
- `route_name` *(string/null)*: Jeepney/tricycle line name or train line name (e.g., `"LRT-1"`, `"Malanday - Monumento"`). Set to `null` for taxi, moto_taxi, or walking.
- `distance_km` *(number)*: Actual distance in kilometers.
- `fare_type` *(string/null)*: Must be one of: `"traditional" | "modern" | "tricycle" | "taxi" | "estimate" | null`.
- `flat_fare` *(number)*: (Tricycle mode only) Custom flat fare value.
- `notes` *(string)*: (Optional) Helpful commute advice or transit directions shown in the UI card.

---

## 📈 Fare Logic Matrix

| Mode | Base Fare / Formula | Excess Fare / Rate | Special Discount Toggle | Notes / Warning |
| :--- | :--- | :--- | :---: | :--- |
| **Traditional Jeepney** | ₱14.00 (first 4.0 km) | +₱2.00 / km | **Yes (20%)** | Regulated fixed rate |
| **Modern Jeepney** | ₱17.00 (first 4.0 km) | +₱2.40 / km | **Yes (20%)** | Regulated fixed rate (Aircon) |
| **Tricycle** | Custom flat fare | N/A (Flat) | No | Negotiated locally per leg |
| **Taxi** | ₱45.00 (Flagdown) | +₱13.50 / km | No | Regulated, variable by traffic |
| **LRT/MRT Train** | Tier-based: 0-4km = ₱15 \| 4-8km = ₱20 \| 8-12km = ₱25 \| >12km = ₱30 | N/A | **Yes (20%)** | Fixed station-to-station tiers |
| **MoveIt / Angkas** | Min: `₱50 + ₱10/km` \| Max: `₱80 + ₱15/km` | Range | No | Rough estimate range only |

*Note: The **20% discount** for Students, Seniors, and PWDs applies exclusively to Traditional Jeepneys, Modern Jeepneys, and Train fares.*

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Setup and Development Run
1. Navigate to the root project folder:
   ```bash
   cd "c:\Users\Gab\Downloads\Saan Punta"
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Start the Vite local development server:
   ```bash
   npm run dev
   ```
4. Open the displayed local server link (usually `http://localhost:5173`) in your browser.
