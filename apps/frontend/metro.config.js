const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// NativeWind v2 handles CSS through its Babel plugin
// Add CSS to source extensions so Metro recognizes CSS imports
config.resolver.sourceExts.push('css')

// For NativeWind v2, CSS is processed by the Babel plugin, not Metro's transformer
// We don't need to configure a CSS transformer here

module.exports = config
