// ponytail: Shared constants for transport modes to prevent duplication and drift.
import { Bus, Train, Car, Bike, Footprints, Zap } from 'lucide-react';

export const MODE_ICONS = {
  jeepney: Bus,
  bus: Bus,
  train: Train,
  taxi: Car,
  moto_taxi: Bike,
  walk: Footprints,
  tricycle: Zap
};

export const MODE_LABELS = {
  jeepney: "Jeepney",
  bus: "Public Bus",
  train: "LRT/MRT Train",
  taxi: "Taxi",
  moto_taxi: "Motorcycle Taxi",
  walk: "Walk",
  tricycle: "Tricycle"
};

export const MODE_COLORS = {
  jeepney: "#3b82f6",     // Blue
  bus: "#db2777",         // Rose/Pink
  train: "#8b5cf6",       // Purple
  taxi: "#dc2626",        // Red
  moto_taxi: "#06b6d4",   // Cyan
  walk: "#9ca3af",        // Muted Grey/Silver
  tricycle: "#f97316"     // Orange
};
