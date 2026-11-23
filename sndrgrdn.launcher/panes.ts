const script = `PATH=/usr/bin:/bin
grep -lF SettingsExtensionAttributes /System/Library/ExtensionKit/Extensions/*.appex/Contents/Info.plist | while IFS= read -r info; do
  [ "$(plutil -extract EXAppExtensionAttributes.SettingsExtensionAttributes.allowsXAppleSystemPreferencesURLScheme raw -o - "$info" 2>/dev/null)" = true ] || continue
  table="\${info%/Info.plist}/Resources/InfoPlist.loctable"
  id=$(plutil -extract CFBundleIdentifier raw -o - "$info") || continue
  name=$(plutil -extract en.CFBundleDisplayName raw -o - "$table" 2>/dev/null || plutil -extract en.CFBundleName raw -o - "$table" 2>/dev/null || plutil -extract CFBundleDisplayName raw -o - "$info" 2>/dev/null || plutil -extract CFBundleName raw -o - "$info") || continue
  printf '%s\\t%s\\n' "$id" "$name"
done`;

export const scanPanes = ["/bin/sh", "-c", script];

export const paneTitles: { readonly [id: string]: string } = {
  "com.apple.Battery-Settings.extension": "Battery",
  "com.apple.HeadphoneSettings": "Headphones",
};
