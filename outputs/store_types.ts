export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  description: string;
  category: string;
  emoji?: string;
  image?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Order {
  id: string;
  items: CartItem[];
  totalAmount: number;
  createdAt: string;
}
