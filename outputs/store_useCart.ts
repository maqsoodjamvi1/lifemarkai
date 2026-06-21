// Cart state is shared app-wide via CartContext, so add-to-cart on any page
// (Home, Shop, Header) reflects everywhere. Re-exported here to keep existing
// imports working: `import { useCart } from '../hooks/useCart'`.
export { useCart } from '../context/CartContext';
