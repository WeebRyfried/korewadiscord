<?php

$wgScriptPath = getenv( 'MEDIAWIKI_SCRIPT_PATH' ) ?: '/wiki';
$wgArticlePath = $wgScriptPath . '/index.php/$1';
$wgUsePathInfo = true;

$server = getenv( 'MEDIAWIKI_SERVER' );
if ( $server ) {
	$wgServer = rtrim( $server, '/' );
}

$siteName = getenv( 'MEDIAWIKI_SITE_NAME' );
if ( $siteName ) {
	$wgSitename = $siteName;
}

$allowAnonEdit = filter_var( getenv( 'MEDIAWIKI_ALLOW_ANON_EDIT' ), FILTER_VALIDATE_BOOLEAN );
$wgGroupPermissions['*']['createaccount'] = true;
$wgGroupPermissions['*']['edit'] = $allowAnonEdit;
$wgGroupPermissions['user']['edit'] = true;
$wgGroupPermissions['user']['createpage'] = true;
$wgGroupPermissions['user']['createtalk'] = true;

$wgEnableUploads = true;
$wgUseImageMagick = false;
$wgEmailConfirmToEdit = false;

$wgDefaultSkin = 'vector';
$wgAllowUserSkin = true;

$wgLogos = [
	'1x' => "$wgScriptPath/resources/assets/wiki.png",
	'icon' => "$wgScriptPath/resources/assets/wiki.png",
];

$wgCookieSecure = ( getenv( 'MEDIAWIKI_SERVER' ) && str_starts_with( getenv( 'MEDIAWIKI_SERVER' ), 'https://' ) );
$wgForceHTTPS = $wgCookieSecure;

$wgSessionCacheType = CACHE_DB;
$wgMainCacheType = CACHE_ACCEL;

$wgEnableEmail = false;
