
export enum ViewMode {
  OVERVIEW = 'overview',
  PREVIEW = 'preview',
  CODE = 'code',
  PRD = 'prd',
  PRESENT = 'present'
}

export enum DeviceType {
  IPHONE = 'iphone',
  PIXEL = 'pixel',
  TABLET = 'tablet'
}

export interface ScreenDefinition {
  name: string;
  id: string;
  purpose: string;
  markup: string;
}

export interface DesignSystem {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    accent: string;
  };
  radius: string;
  font: string;
}

export interface Connection {
  fromScreenId: string;
  toScreenId: string;
  label: string;
}

export interface Snapshot {
  id: string;
  name: string;
  timestamp: number;
  data: AIResponse;
}

export interface AIResponse {
  overview: {
    name: string;
    description: string;
    targetUsers: string[];
  };
  screens: ScreenDefinition[];
  designSystem: DesignSystem;
  connections?: Connection[];
}
