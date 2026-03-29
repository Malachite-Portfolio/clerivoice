import colors from './colors';

const theme = {
  colors,
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 22,
    xl: 30,
  },
  radius: {
    sm: 14,
    md: 20,
    lg: 28,
    pill: 999,
  },
  typography: {
    h1: 30,
    h2: 26,
    h3: 20,
    title: 17,
    body: 15,
    caption: 13,
    tiny: 11,
  },
  shadow: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.34,
      shadowRadius: 18,
      elevation: 8,
    },
    glow: {
      shadowColor: colors.magenta,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 6,
    },
  },
  gradients: {
    bg: ['#05020D', '#0C0212', '#18051F'],
    cta: ['#C90B8A', '#FF1B9B'],
    panel: ['#53163F', '#6B1B57', '#4B153D'],
    card: ['rgba(30,24,43,0.95)', 'rgba(27,16,35,0.95)'],
    drawer: ['#1C0A22', '#170718', '#220C2A'],
  },
};

export default theme;
