/** Platform UI locales (Lovable parity: interface language picker). */

export type PlatformLocale = "en" | "es" | "fr" | "de" | "pt" | "ja" | "zh";

export const PLATFORM_LOCALES: Array<{ code: PlatformLocale; label: string; native: string }> = [
  { code: "en", label: "English", native: "English" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "zh", label: "Chinese", native: "中文" },
];

export const PLATFORM_LOCALE_STORAGE_KEY = "lifemark-platform-locale";

export type PlatformStringKey =
  | "nav.dashboard"
  | "nav.projects"
  | "nav.templates"
  | "nav.settings"
  | "nav.billing"
  | "nav.team"
  | "settings.title"
  | "settings.appearance"
  | "settings.language"
  | "settings.languageHint"
  | "settings.save";

const EN: Record<PlatformStringKey, string> = {
  "nav.dashboard": "Dashboard",
  "nav.projects": "Projects",
  "nav.templates": "Templates",
  "nav.settings": "Settings",
  "nav.billing": "Billing",
  "nav.team": "Team",
  "settings.title": "Settings",
  "settings.appearance": "Appearance",
  "settings.language": "Interface language",
  "settings.languageHint": "Choose the language for menus and settings. Generated apps use the project i18n panel separately.",
  "settings.save": "Save",
};

const ES: Record<PlatformStringKey, string> = {
  ...EN,
  "nav.dashboard": "Panel",
  "nav.projects": "Proyectos",
  "nav.templates": "Plantillas",
  "nav.settings": "Ajustes",
  "nav.billing": "Facturación",
  "nav.team": "Equipo",
  "settings.title": "Ajustes",
  "settings.appearance": "Apariencia",
  "settings.language": "Idioma de la interfaz",
  "settings.languageHint": "Elige el idioma de menús y ajustes. Las apps generadas usan el panel i18n del proyecto.",
  "settings.save": "Guardar",
};

const FR: Record<PlatformStringKey, string> = {
  ...EN,
  "nav.dashboard": "Tableau de bord",
  "nav.projects": "Projets",
  "nav.templates": "Modèles",
  "nav.settings": "Paramètres",
  "nav.billing": "Facturation",
  "nav.team": "Équipe",
  "settings.title": "Paramètres",
  "settings.appearance": "Apparence",
  "settings.language": "Langue de l'interface",
  "settings.languageHint": "Langue des menus et paramètres. Les apps générées utilisent le panneau i18n du projet.",
  "settings.save": "Enregistrer",
};

const DE: Record<PlatformStringKey, string> = {
  ...EN,
  "nav.dashboard": "Übersicht",
  "nav.projects": "Projekte",
  "nav.templates": "Vorlagen",
  "nav.settings": "Einstellungen",
  "nav.billing": "Abrechnung",
  "nav.team": "Team",
  "settings.title": "Einstellungen",
  "settings.appearance": "Darstellung",
  "settings.language": "Oberflächensprache",
  "settings.languageHint": "Sprache für Menüs und Einstellungen. Generierte Apps nutzen das Projekt-i18n-Panel.",
  "settings.save": "Speichern",
};

const PT: Record<PlatformStringKey, string> = {
  ...EN,
  "nav.dashboard": "Painel",
  "nav.projects": "Projetos",
  "nav.templates": "Modelos",
  "nav.settings": "Configurações",
  "nav.billing": "Cobrança",
  "nav.team": "Equipe",
  "settings.title": "Configurações",
  "settings.appearance": "Aparência",
  "settings.language": "Idioma da interface",
  "settings.languageHint": "Idioma dos menus e configurações. Apps gerados usam o painel i18n do projeto.",
  "settings.save": "Salvar",
};

const JA: Record<PlatformStringKey, string> = {
  ...EN,
  "nav.dashboard": "ダッシュボード",
  "nav.projects": "プロジェクト",
  "nav.templates": "テンプレート",
  "nav.settings": "設定",
  "nav.billing": "請求",
  "nav.team": "チーム",
  "settings.title": "設定",
  "settings.appearance": "外観",
  "settings.language": "表示言語",
  "settings.languageHint": "メニューと設定の言語。生成アプリはプロジェクトの i18n パネルを使用します。",
  "settings.save": "保存",
};

const ZH: Record<PlatformStringKey, string> = {
  ...EN,
  "nav.dashboard": "控制台",
  "nav.projects": "项目",
  "nav.templates": "模板",
  "nav.settings": "设置",
  "nav.billing": "账单",
  "nav.team": "团队",
  "settings.title": "设置",
  "settings.appearance": "外观",
  "settings.language": "界面语言",
  "settings.languageHint": "菜单和设置的语言。生成的应用使用项目 i18n 面板。",
  "settings.save": "保存",
};

export const PLATFORM_STRINGS: Record<PlatformLocale, Record<PlatformStringKey, string>> = {
  en: EN,
  es: ES,
  fr: FR,
  de: DE,
  pt: PT,
  ja: JA,
  zh: ZH,
};

export function isPlatformLocale(value: string): value is PlatformLocale {
  return PLATFORM_LOCALES.some((l) => l.code === value);
}

export function getStoredPlatformLocale(): PlatformLocale {
  if (typeof window === "undefined") return "en";
  try {
    const raw = localStorage.getItem(PLATFORM_LOCALE_STORAGE_KEY);
    if (raw && isPlatformLocale(raw)) return raw;
  } catch {
    /* private mode */
  }
  return "en";
}

export function translatePlatform(locale: PlatformLocale, key: PlatformStringKey): string {
  return PLATFORM_STRINGS[locale][key] ?? PLATFORM_STRINGS.en[key] ?? key;
}
