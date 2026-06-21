import type { Product } from '../lib/types';

export const MOCK_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Wireless Headphones', price: 2999, stock: 23, emoji: '🎧',
    description: 'Over-ear headphones with active noise cancellation.', category: 'Electronics' },
  { id: 'p2', name: 'Smartphone', price: 69999, stock: 15, emoji: '📱',
    description: 'Flagship phone with a high-resolution OLED display.', category: 'Electronics' },
  { id: 'p3', name: 'Mechanical Keyboard', price: 8999, stock: 41, emoji: '⌨️',
    description: 'Hot-swappable switches with per-key RGB lighting.', category: 'Accessories' },
  { id: 'p4', name: 'Smart Watch', price: 19999, stock: 30, emoji: '⌚',
    description: 'Fitness tracking, notifications, and 7-day battery.', category: 'Wearables' },
  { id: 'p5', name: 'Portable Speaker', price: 4499, stock: 52, emoji: '🔊',
    description: 'Waterproof Bluetooth speaker with deep bass.', category: 'Audio' },
  { id: 'p6', name: 'USB-C Hub', price: 3499, stock: 64, emoji: '🔌',
    description: '7-in-1 hub with HDMI, ethernet, and fast charging.', category: 'Accessories' },
];
