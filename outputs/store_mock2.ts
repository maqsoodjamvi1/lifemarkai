import type { Product } from '../lib/types';

// Real product photos via loremflickr (keyword-matched, ?lock fixes the image so
// it stays stable). ProductCard falls back to the emoji if an image fails to load.
const img = (keyword: string, lock: number) =>
  `https://loremflickr.com/600/450/${keyword}?lock=${lock}`;

export const MOCK_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Wireless Headphones', price: 2999, stock: 23, emoji: '🎧',
    description: 'Over-ear headphones with active noise cancellation.', category: 'Electronics',
    image: img('headphones', 11) },
  { id: 'p2', name: 'Smartphone', price: 69999, stock: 15, emoji: '📱',
    description: 'Flagship phone with a high-resolution OLED display.', category: 'Electronics',
    image: img('smartphone', 22) },
  { id: 'p3', name: 'Mechanical Keyboard', price: 8999, stock: 41, emoji: '⌨️',
    description: 'Hot-swappable switches with per-key RGB lighting.', category: 'Accessories',
    image: img('keyboard', 33) },
  { id: 'p4', name: 'Smart Watch', price: 19999, stock: 30, emoji: '⌚',
    description: 'Fitness tracking, notifications, and 7-day battery.', category: 'Wearables',
    image: img('smartwatch', 44) },
  { id: 'p5', name: 'Portable Speaker', price: 4499, stock: 52, emoji: '🔊',
    description: 'Waterproof Bluetooth speaker with deep bass.', category: 'Audio',
    image: img('speaker', 55) },
  { id: 'p6', name: 'USB-C Hub', price: 3499, stock: 64, emoji: '🔌',
    description: '7-in-1 hub with HDMI, ethernet, and fast charging.', category: 'Accessories',
    image: img('usb%2Cgadget', 66) },
];
