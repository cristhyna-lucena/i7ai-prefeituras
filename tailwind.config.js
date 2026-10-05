import sgdm from '@sgdm/design/tailwind-preset';

export default {
  presets: [sgdm],
  content: ['./index.html', './src/**/*.{js,jsx}', './node_modules/@sgdm/design/dist/**/*.{js,cjs}'],
};
