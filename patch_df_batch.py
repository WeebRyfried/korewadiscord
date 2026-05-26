p = '/home/ryfried/korewadiscord/wiki/Dockerfile'
with open(p) as f:
    content = f.read()
old = 'COPY extensions/Popups /var/www/html/extensions/Popups\n\nRUN mkdir'
new = 'COPY extensions/Popups /var/www/html/extensions/Popups\nCOPY extensions/Comments /var/www/html/extensions/Comments\nCOPY extensions/DynamicPageList /var/www/html/extensions/DynamicPageList\nCOPY extensions/CodeMirror /var/www/html/extensions/CodeMirror\n\nRUN mkdir'
content = content.replace(old, new)
with open(p, 'w') as f:
    f.write(content)
print('done')
