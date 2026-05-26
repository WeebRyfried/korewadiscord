p = '/home/ryfried/korewadiscord/wiki/LocalSettings.override.php'
with open(p) as f:
    content = f.read()
old = "wfLoadExtension( 'KorewaAdminDashboard' );\n$wgGroupPermissions['sysop']['korewa-admin-dashboard'] = true;\n$wgGroupPermissions['bureaucrat']['korewa-admin-dashboard'] = true;\n\n$wgHooks['BeforePageDisplay']"
new = "wfLoadExtension( 'KorewaAdminDashboard' );\n$wgGroupPermissions['sysop']['korewa-admin-dashboard'] = true;\n$wgGroupPermissions['bureaucrat']['korewa-admin-dashboard'] = true;\n\nwfLoadExtension( 'RelatedArticles' );\n$wgRelatedArticlesUseCirrusSearch = false;\n\nwfLoadExtension( 'Popups' );\n$wgPopupsVirtualPagePreview = true;\n$wgPopupsReferencePreviews = true;\n\n$wgHooks['BeforePageDisplay']"
content = content.replace(old, new)
with open(p, 'w') as f:
    f.write(content)
print('done')
