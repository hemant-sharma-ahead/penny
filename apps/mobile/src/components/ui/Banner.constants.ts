export type BannerVariant = 'info' | 'warning' | 'danger' | 'success';

export const BANNER_DEFAULT_ICON: Record<BannerVariant, string> = {
  info: 'ti-info-circle',
  warning: 'ti-alert-triangle',
  danger: 'ti-alert-triangle',
  success: 'ti-circle-check'
};
