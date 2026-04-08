import colors from './colors';

const theme = {
  colors,
  spacing: {
    xs: 4,
    sm: 8,
    md: 14,
    lg: 20,
    xl: 28,
    xxl: 36,
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    xl: 30,
    pill: 999,
  },
  typography: {
    h1: 32,
    h2: 24,
    h3: 18,
    title: 16,
    body: 14,
    caption: 12,
    tiny: 11,
  },
  shadow: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.22,
      shadowRadius: 20,
      elevation: 6,
    },
    glow: {
      shadowColor: colors.magenta,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.38,
      shadowRadius: 14,
      elevation: 4,
    },
  },
  gradients: {
    bg: ['#05030D', '#0A0613', '#130A1F'],
    cta: ['#B50D87', '#D10B95', '#F61FA7'],
    panel: ['#4F163E', '#682152', '#3B132F'],
    card: ['rgba(26,22,40,0.96)', 'rgba(22,15,33,0.96)'],
    drawer: ['#160A21', '#120819', '#1E0E2B'],
  },
};

export default theme;
