<?php

$wgScriptPath = getenv( 'MEDIAWIKI_SCRIPT_PATH' ) ?: '/wiki';
$wgArticlePath = $wgScriptPath . '/index.php/$1';
$wgUsePathInfo = true;
$korewaAssetPath = $wgScriptPath . '/resources/assets/korewa';

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
$wgMaxUploadSize = 5 * 1024 * 1024;
$wgUseImageMagick = false;
$wgEmailConfirmToEdit = false;

$passwordPolicyGroups = [ 'bureaucrat', 'sysop', 'interface-admin', 'bot', 'default' ];
foreach ( $passwordPolicyGroups as $groupName ) {
	$wgPasswordPolicy['policies'][$groupName]['MinimalPasswordLength'] = 1;
	$wgPasswordPolicy['policies'][$groupName]['MinimumPasswordLengthToLogin'] = 1;
	$wgPasswordPolicy['policies'][$groupName]['PasswordCannotBeSubstringInUsername'] = false;
	$wgPasswordPolicy['policies'][$groupName]['PasswordCannotMatchDefaults'] = false;
	$wgPasswordPolicy['policies'][$groupName]['PasswordNotInCommonList'] = false;
}

$korewaExtensionLoaded = static function ( $name ) {
	return class_exists( 'ExtensionRegistry' ) && ExtensionRegistry::getInstance()->isLoaded( $name );
};

$korewaLoadExtension = static function ( $name ) use ( $korewaExtensionLoaded ) {
	global $IP;

	if ( file_exists( "$IP/extensions/$name/extension.json" ) && !$korewaExtensionLoaded( $name ) ) {
		wfLoadExtension( $name );
	}
};

foreach ( [
	'Cite',
	'ParserFunctions',
	'Scribunto',
	'TemplateData',
	'WikiEditor',
	'CodeEditor',
	'VisualEditor',
] as $extensionName ) {
	$korewaLoadExtension( $extensionName );
}

if ( $korewaExtensionLoaded( 'Scribunto' ) && extension_loaded( 'luasandbox' ) ) {
	$wgScribuntoDefaultEngine = 'luasandbox';
}

if ( file_exists( "$IP/skins/Vector/skin.json" ) && !$korewaExtensionLoaded( 'Vector' ) ) {
	wfLoadSkin( 'Vector' );
}

$wgDefaultSkin = getenv( 'MEDIAWIKI_DEFAULT_SKIN' ) ?: 'vector-2022';
$wgAllowUserSkin = true;
$wgVectorResponsive = true;
$wgVectorUseIconWatch = true;
$wgDefaultUserOptions['skin'] = $wgDefaultSkin;
$wgDefaultUserOptions['vector-feature-limited-width'] = 1;
$wgDefaultUserOptions['vector-feature-toc-pinned'] = 1;
$wgDefaultUserOptions['vector-feature-main-menu-pinned'] = 1;
$wgDefaultUserOptions['vector-feature-page-tools-pinned'] = 1;
$wgDefaultUserOptions['vector-feature-appearance-pinned'] = 1;

if ( file_exists( "$IP/extensions/MobileFrontend/extension.json" ) && !$korewaExtensionLoaded( 'MobileFrontend' ) ) {
	wfLoadExtension( 'MobileFrontend' );
}

if ( $korewaExtensionLoaded( 'MobileFrontend' ) ) {
	$wgMFAutodetectMobileView = true;

	if ( file_exists( "$IP/skins/MinervaNeue/skin.json" ) ) {
		if ( !$korewaExtensionLoaded( 'MinervaNeue' ) ) {
			wfLoadSkin( 'MinervaNeue' );
		}

		$wgDefaultMobileSkin = 'minerva';
	} else {
		$wgDefaultMobileSkin = 'vector';
	}
}

wfLoadExtension( 'KorewaAdminDashboard' );
$wgGroupPermissions['sysop']['korewa-admin-dashboard'] = true;
$wgGroupPermissions['bureaucrat']['korewa-admin-dashboard'] = true;

$wgHooks['BeforePageDisplay'][] = static function ( $out, $skin ) use ( $korewaAssetPath ) {
	$out->addMeta( 'viewport', 'width=device-width, initial-scale=1' );
	$out->addStyle( "$korewaAssetPath/modern-wiki.css?v=20260523-heading-lines" );

	return true;
};

$wgLogos = [
	'1x' => "$korewaAssetPath/KWIKILOGO.png",
	'icon' => "$korewaAssetPath/KWIKILOGO.png",
];

$wgCookieSecure = ( getenv( 'MEDIAWIKI_SERVER' ) && str_starts_with( getenv( 'MEDIAWIKI_SERVER' ), 'https://' ) );
$wgForceHTTPS = $wgCookieSecure;

$wgSessionCacheType = CACHE_DB;
$wgMainCacheType = CACHE_ACCEL;

$wgEnableEmail = false;
