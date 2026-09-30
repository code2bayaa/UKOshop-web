import {
  Baby, Car, Dumbbell, Package, Shirt, Smartphone, Sofa, Sparkles, Wheat, type LucideIcon,
  Headphones, Laptop, Watch, Footprints, CookingPot, Armchair, Sun, Wrench, Leaf,
} from 'lucide-react'

/** Maps the `icon` string stored on categories to a lucide component. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  shirt: Shirt,
  sofa: Sofa,
  baby: Baby,
  dumbbell: Dumbbell,
  car: Car,
  sparkles: Sparkles,
  wheat: Wheat,
  package: Package,
  headphones: Headphones,
  laptop: Laptop,
  watch: Watch,
  footprints: Footprints,
  'cooking-pot': CookingPot,
  armchair: Armchair,
  sun: Sun,
  wrench: Wrench,
  leaf: Leaf,
}

export function categoryIcon(name: string | undefined): LucideIcon {
  return CATEGORY_ICONS[name || 'package'] || Package
}
