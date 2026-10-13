import { Box } from '@mui/material';

/**
 * 组件：分类图标
 * 功能：在分类相关位置显示对应图标，帮助用户快速辨认分类。
 */
export const popularCategoryIcons = [
  { name: 'AccountBalance', label: '银行' },
  { name: 'AccountBalanceWallet', label: '钱包' },
  { name: 'AttachMoney', label: '现金' },
  { name: 'Book', label: '书籍' },
  { name: 'Build', label: '维修' },
  { name: 'Cake', label: '甜点' },
  { name: 'CardGiftcard', label: '礼物' },
  { name: 'CreditCard', label: '银行卡' },
  { name: 'DirectionsBike', label: '自行车' },
  { name: 'DirectionsBus', label: '公交' },
  { name: 'DirectionsCar', label: '汽车' },
  { name: 'ElectricBolt', label: '电费' },
  { name: 'Fastfood', label: '快餐' },
  { name: 'Flight', label: '旅行' },
  { name: 'Home', label: '住房' },
  { name: 'LocalCafe', label: '咖啡' },
  { name: 'LocalGasStation', label: '燃油' },
  { name: 'LocalGroceryStore', label: '杂货' },
  { name: 'LocalHospital', label: '医疗' },
  { name: 'LocalMovies', label: '电影' },
  { name: 'LocalOffer', label: '优惠' },
  { name: 'LocalParking', label: '停车' },
  { name: 'Movie', label: '娱乐' },
  { name: 'Pets', label: '宠物' },
  { name: 'PhoneAndroid', label: '手机' },
  { name: 'Restaurant', label: '餐饮' },
  { name: 'Savings', label: '储蓄' },
  { name: 'School', label: '教育' },
  { name: 'ShoppingBag', label: '购物袋' },
  { name: 'ShoppingCart', label: '购物车' },
] as const;

const legacyIconNames: Record<string, string> = {
  'account-balance': 'AccountBalance',
  wallet: 'AccountBalanceWallet',
  money: 'AttachMoney',
  book: 'Book',
  build: 'Build',
  cake: 'Cake',
  gift: 'CardGiftcard',
  'credit-card': 'CreditCard',
  bicycle: 'DirectionsBike',
  bus: 'DirectionsBus',
  car: 'DirectionsCar',
  electricity: 'ElectricBolt',
  fastfood: 'Fastfood',
  flight: 'Flight',
  home: 'Home',
  cafe: 'LocalCafe',
  gas: 'LocalGasStation',
  groceries: 'LocalGroceryStore',
  health: 'LocalHospital',
  cinema: 'LocalMovies',
  offer: 'LocalOffer',
  parking: 'LocalParking',
  movie: 'Movie',
  pets: 'Pets',
  phone: 'PhoneAndroid',
  restaurant: 'Restaurant',
  savings: 'Savings',
  school: 'School',
  'shopping-bag': 'ShoppingBag',
  'shopping-cart': 'ShoppingCart',
};

const iconLigatureOverrides: Record<string, string> = {
  ThreeDRotation: '3d_rotation',
  OneK: '1k',
  OneKPlus: '1k_plus',
  TwoK: '2k',
  TwoKPlus: '2k_plus',
  ThreeK: '3k',
  ThreeKPlus: '3k_plus',
  FourK: '4k',
  FourKPlus: '4k_plus',
  FiveK: '5k',
  FiveKPlus: '5k_plus',
  SixK: '6k',
  SixKPlus: '6k_plus',
  SevenK: '7k',
  SevenKPlus: '7k_plus',
  EightK: '8k',
  EightKPlus: '8k_plus',
  NineK: '9k',
  NineKPlus: '9k_plus',
};

type CategoryIconProps = {
  name: string | null;
  fontSize?: 'inherit' | 'small' | 'medium' | 'large';
  color?: string;
};

export function normalizeCategoryIconName(name: string | null): string | null {
  if (!name) return null;
  return legacyIconNames[name] ?? name;
}

export function getCategoryIconLabel(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2');
}

export function getCategoryIconLigature(name: string): string {
  return iconLigatureOverrides[name] ?? name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

export default function CategoryIcon({ name, fontSize = 'medium', color = 'inherit' }: CategoryIconProps) {
  // 将旧图标名称转换为当前使用的标准名称。
  const iconName = normalizeCategoryIconName(name);
  if (!iconName) return null;

  return (
    <Box
      component="span"
      aria-hidden="true"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        fontFamily: '"Material Icons"',
        fontFeatureSettings: '"liga"',
        fontWeight: 400,
        fontStyle: 'normal',
        fontSize: { inherit: 'inherit', small: 20, medium: 24, large: 35 }[fontSize],
        lineHeight: 1,
        letterSpacing: 'normal',
        textTransform: 'none',
        whiteSpace: 'nowrap',
        direction: 'ltr',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      {getCategoryIconLigature(iconName)}
    </Box>
  );
}