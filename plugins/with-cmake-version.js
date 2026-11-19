/**
 * Expo config plugin: az Android natív build újabb CMake-et használjon.
 *
 * Ok: Windowson a CMake 3.22 mellé csomagolt ninja 1.10 nem kezeli a 260 karakternél hosszabb útvonalakat
 * („Filename longer than 260 characters”), még bekapcsolt LongPathsEnabled mellett sem.
 * A CMake 3.31 ninjája már igen. A Gradle első buildkor magától letölti az Android SDK-ból.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const VERSION = '3.31.6';
const MARKER = '// visszajaro: cmake-version';

module.exports = function withCmakeVersion(config, version = VERSION) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `
${MARKER}
android {
    externalNativeBuild {
        cmake {
            version "${version}"
        }
    }
}
`;
    }
    return cfg;
  });
};
