p = '/home/ryfried/korewadiscord/wiki/LocalSettings.override.php'
with open(p) as f:
    content = f.read()
old = 'require_once "$IP/extensions/DynamicPageList/DynamicPageList.php";'
new = "require_once __DIR__ . '/extensions/DynamicPageList/DynamicPageList.php';"
content = content.replace(old, new)
with open(p, 'w') as f:
    f.write(content)
print('done')
