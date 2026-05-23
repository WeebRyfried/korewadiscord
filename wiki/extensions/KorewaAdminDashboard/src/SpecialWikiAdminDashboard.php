<?php

class SpecialWikiAdminDashboard extends SpecialPage {
	public function __construct() {
		parent::__construct( 'WikiAdminDashboard', 'korewa-admin-dashboard' );
	}

	public function execute( $subPage ) {
		$this->setHeaders();
		$this->checkPermissions();

		$out = $this->getOutput();
		$out->setPageTitle( $this->msg( 'korewaadmindashboard-title' )->text() );
		$out->addStyle( $GLOBALS['wgScriptPath'] . '/extensions/KorewaAdminDashboard/resources/dashboard.css' );
		$out->addHTML( $this->renderDashboard() );
	}

	private function renderDashboard() {
		$userName = htmlspecialchars( $this->getUser()->getName(), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
		$sections = [
			'Review' => [
				[ 'Recent changes', 'Track edits, uploads, account changes, and page moves.', $this->specialUrl( 'RecentChanges' ) ],
				[ 'New pages', 'Review newly created articles and drafts.', $this->specialUrl( 'NewPages' ) ],
				[ 'Public logs', 'Audit deletes, moves, uploads, protections, and account actions.', $this->specialUrl( 'Log' ) ],
				[ 'Watchlist', 'Open your watched pages and recent watched changes.', $this->specialUrl( 'Watchlist' ) ],
			],
			'Content' => [
				[ 'All pages', 'Browse every page by namespace and prefix.', $this->specialUrl( 'AllPages' ) ],
				[ 'Categories', 'Review the category structure used across the wiki.', $this->specialUrl( 'Categories' ) ],
				[ 'Wanted pages', 'Find links that point to missing pages.', $this->specialUrl( 'WantedPages' ) ],
				[ 'Upload file', 'Add images and documents to the wiki file library.', $this->specialUrl( 'Upload' ) ],
			],
			'Users' => [
				[ 'User rights', 'Promote or demote trusted wiki users.', $this->specialUrl( 'UserRights' ) ],
				[ 'List users', 'Search accounts by group or username.', $this->specialUrl( 'ListUsers' ) ],
				[ 'Create account', 'Create a wiki account manually when needed.', $this->specialUrl( 'CreateAccount' ) ],
				[ 'Block user', 'Block disruptive accounts or IP addresses.', $this->specialUrl( 'Block' ) ],
			],
			'Site' => [
				[ 'Statistics', 'Check page, edit, user, and file counts.', $this->specialUrl( 'Statistics' ) ],
				[ 'Protected pages', 'Review pages with edit or move protections.', $this->specialUrl( 'ProtectedPages' ) ],
				[ 'Interface messages', 'Inspect or customize system interface text.', $this->specialUrl( 'AllMessages' ) ],
				[ 'Special pages', 'Open the full MediaWiki tool index.', $this->specialUrl( 'SpecialPages' ) ],
			],
			'Appearance' => [
				[ 'Edit sidebar', 'Update navigation links shown in the wiki sidebar.', $this->titleUrl( NS_MEDIAWIKI, 'Sidebar', 'action=edit' ) ],
				[ 'Edit common CSS', 'Adjust global wiki styling through MediaWiki:Common.css.', $this->titleUrl( NS_MEDIAWIKI, 'Common.css', 'action=edit' ) ],
				[ 'Edit mobile CSS', 'Adjust mobile-only styling when MobileFrontend is enabled.', $this->titleUrl( NS_MEDIAWIKI, 'Mobile.css', 'action=edit' ) ],
				[ 'Version', 'Verify installed MediaWiki, skins, and extensions.', $this->specialUrl( 'Version' ) ],
			],
		];

		$html = '<div class="korewa-admin-dashboard">';
		$html .= '<header class="korewa-admin-dashboard__hero">';
		$html .= '<p class="korewa-admin-dashboard__eyebrow">KorewaDiscord wiki</p>';
		$html .= '<h1 class="korewa-admin-dashboard__title">Admin dashboard</h1>';
		$html .= '<p class="korewa-admin-dashboard__summary">Signed in as ' . $userName . '. Use these shortcuts for the day-to-day wiki work: review changes, manage pages, handle users, and tune the site interface.</p>';
		$html .= '</header>';
		$html .= '<div class="korewa-admin-dashboard__grid">';

		foreach ( $sections as $heading => $items ) {
			$html .= $this->renderSection( $heading, $items );
		}

		$html .= '</div>';
		$html .= '<p class="korewa-admin-dashboard__footer">Only wiki administrators can open this dashboard.</p>';
		$html .= '</div>';

		return $html;
	}

	private function renderSection( $heading, array $items ) {
		$html = '<section class="korewa-admin-dashboard__section">';
		$html .= '<h2 class="korewa-admin-dashboard__section-title">' . $this->escape( $heading ) . '</h2>';
		$html .= '<div class="korewa-admin-dashboard__links">';

		foreach ( $items as $item ) {
			$html .= $this->renderLink( $item[0], $item[1], $item[2] );
		}

		$html .= '</div>';
		$html .= '</section>';

		return $html;
	}

	private function renderLink( $label, $description, $url ) {
		return '<div class="korewa-admin-dashboard__link">'
			. '<a href="' . $this->escape( $url ) . '">' . $this->escape( $label ) . '</a>'
			. '<p>' . $this->escape( $description ) . '</p>'
			. '</div>';
	}

	private function specialUrl( $specialPage, $query = '' ) {
		return SpecialPage::getTitleFor( $specialPage )->getLocalURL( $query );
	}

	private function titleUrl( $namespace, $title, $query = '' ) {
		$pageTitle = Title::makeTitleSafe( $namespace, $title );

		if ( !$pageTitle ) {
			return '#';
		}

		return $pageTitle->getLocalURL( $query );
	}

	private function escape( $value ) {
		return htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
	}
}
