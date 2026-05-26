p = '/home/ryfried/korewadiscord/wiki/LocalSettings.override.php'
with open(p) as f:
    lines = f.readlines()

result = []

in_foreach = False
foreach_done = False
for line in lines:
    result.append(line)
    # After TextExtracts in the foreach list, add new bundled extensions
    if not foreach_done and line.strip() == "'TextExtracts',":
        result.append("\t'MultimediaViewer',\n")
        result.append("\t'CategoryTree',\n")
        result.append("\t'SyntaxHighlight_GeSHi',\n")
        result.append("\t'SpamBlacklist',\n")
        result.append("\t'ConfirmEdit',\n")
        result.append("\t'ReplaceText',\n")
        foreach_done = True

    # After Popups block, add the new extensions with config
    if line.strip() == "$wgPopupsReferencePreviews = true;":
        result.append("\n")
        result.append("wfLoadExtension( 'Comments' );\n")
        result.append("$wgCommentsDefaultAvatar = '/wiki/resources/assets/korewa/KWIKILOGO.png';\n")
        result.append("$wgCommentsSortDescending = true;\n")
        result.append("$wgGroupPermissions['*']['comment'] = true;\n")
        result.append("$wgGroupPermissions['*']['commentlinks'] = false;\n")
        result.append("$wgGroupPermissions['autoconfirmed']['commentlinks'] = true;\n")
        result.append("\n")
        result.append("wfLoadExtension( 'DynamicPageList' );\n")
        result.append("\n")
        result.append("wfLoadExtension( 'CodeMirror' );\n")
        result.append("$wgCodeMirrorEnable = true;\n")

with open(p, 'w') as f:
    f.writelines(result)

print('done')
