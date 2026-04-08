import colors, { gradients } from './colors';
import typography from './typography';
import spacing from './spacing';
import radius from './radius';
import shadows from './shadows';

const theme = {
  colors,
  typography,
  spacing,
  radius,
  shadows,
  shadow: shadows,
  gradients: {
    bg: gradients.appBackground,
    cta: gradients.primaryButton,
    panel: gradients.card,
    card: gradients.card,
    drawer: gradients.drawer,
  },
};

export default theme;
