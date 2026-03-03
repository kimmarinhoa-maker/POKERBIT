// Re-export from the canonical source (shared between client and server)
export {
  type PermRole,
  type PermResource,
  CONFIGURABLE_ROLES,
  ALL_RESOURCES,
  DEFAULT_PERMISSIONS,
  getDefaultPermission,
  getDefaultPermissionsForRole,
} from '../defaultPermissions';
