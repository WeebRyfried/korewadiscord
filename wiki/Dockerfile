FROM mediawiki:1.42

RUN apt-get update \
    && apt-get install -y --no-install-recommends default-mysql-client curl \
    && rm -rf /var/lib/apt/lists/*

RUN { \
        echo 'upload_max_filesize = 5M'; \
        echo 'post_max_size = 6M'; \
    } > /usr/local/etc/php/conf.d/korewa-upload-limit.ini

COPY LocalSettings.override.php /var/www/html/LocalSettings.override.php
COPY apache-wiki-alias.conf /etc/apache2/conf-available/korewa-wiki-alias.conf
COPY docker-entrypoint.sh /usr/local/bin/korewa-mediawiki-entrypoint.sh
COPY extensions/KorewaAdminDashboard /var/www/html/extensions/KorewaAdminDashboard

RUN mkdir -p /var/www/html/resources/assets/korewa \
    && a2enconf korewa-wiki-alias \
    && find /var/www/html/extensions/KorewaAdminDashboard -type d -exec chmod 755 {} + \
    && find /var/www/html/extensions/KorewaAdminDashboard -type f -exec chmod 644 {} + \
    && chmod +x /usr/local/bin/korewa-mediawiki-entrypoint.sh

COPY assets/ /var/www/html/resources/assets/korewa/

RUN find /var/www/html/resources/assets/korewa -type d -exec chmod 755 {} + \
    && find /var/www/html/resources/assets/korewa -type f -exec chmod 644 {} +

ENTRYPOINT ["korewa-mediawiki-entrypoint.sh"]
CMD ["apache2-foreground"]
