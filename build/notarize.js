import { notarize } from '@electron/notarize';

export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appleId = process.env['APPLE_ID'];
  const appleTeamId = process.env['APPLE_TEAM_ID'];
  const appleAppPassword = process.env['APPLE_APP_PASSWORD'];

  if (!appleId || !appleTeamId || !appleAppPassword) {
    console.warn('[notarize] Skipping: APPLE_ID, APPLE_TEAM_ID, or APPLE_APP_PASSWORD not set');
    return;
  }

  console.log(`[notarize] Notarizing ${appName}...`);
  await notarize({
    tool: 'notarytool',
    appPath: `${appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword: appleAppPassword,
    teamId: appleTeamId,
  });
}
