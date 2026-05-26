p = '/home/ryfried/korewadiscord/wiki/Dockerfile'
with open(p) as f:
    content = f.read()
old = 'COPY extensions/KorewaAdminDashboard /var/www/html/extensions/KorewaAdminDashboard\n\nRUN mkdir'
new = 'COPY extensions/KorewaAdminDashboard /var/www/html/extensions/KorewaAdminDashboard\nCOPY extensions/RelatedArticles /var/www/html/extensions/RelatedArticles\nCOPY extensions/Popups /var/www/html/extensions/Popups\n\nRUN mkdir'
content = content.replace(old, new)
with open(p, 'w') as f:
    f.write(content)
print('done')
