export interface GalCodeUserSettings {
  collectInteractiveSessions: boolean;
}

export interface UserSettings {
  galCode: GalCodeUserSettings;
}

export interface UpdateUserSettingsRequest {
  galCode?: Partial<GalCodeUserSettings>;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  galCode: {
    collectInteractiveSessions: true,
  },
};
