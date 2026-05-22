FROM mediawiki:1.42

RUN apt-get update \
    && apt-get install -y --no-install-recommends default-mysql-client curl \
    && rm -rf /var/lib/apt/lists/*

COPY LocalSettings.override.php /var/www/html/LocalSettings.override.php
COPY docker-entrypoint.sh /usr/local/bin/korewa-mediawiki-entrypoint.sh

RUN chmod +x /usr/local/bin/korewa-mediawiki-entrypoint.sh

ENTRYPOINT ["korewa-mediawiki-entrypoint.sh"]
CMD ["apache2-foreground"]
