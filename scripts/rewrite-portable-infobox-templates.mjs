#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const arg = ( name, fallback = '' ) => `{{{${name}|${fallback}}}}`;
const argValue = ( name ) => `{{{${name}}}}`;

const imageMarkup = ( source, captionSource ) => {
	const caption = captionSource
		? `{{#if:${arg( captionSource )}|<div class="infobox-caption">${argValue( captionSource )}</div>}}`
		: '';

	return [
		`{{#if:${arg( source )}|<tr><td colspan="2" class="infobox-image">[[File:${argValue( source )}{{!}}frameless{{!}}250px]]${caption}</td></tr>}}`
	];
};

const rowMarkup = ( row ) => {
	const condition = row.condition?.map( ( name ) => arg( name ) ).join( '' ) || arg( row.source );
	const value = row.value || argValue( row.source );

	return `{{#if:${condition}|<tr><th scope="row" class="infobox-label">${row.label}</th><td class="infobox-data">${value}</td></tr>}}`;
};

const groupMarkup = ( group ) => {
	const condition = group.rows.map( ( row ) => {
		if ( row.condition ) {
			return row.condition.map( ( name ) => arg( name ) ).join( '' );
		}

		return arg( row.source );
	} ).join( '' );

	return [
		`{{#if:${condition}|<tr><th colspan="2" class="infobox-header">${group.header}</th></tr>}}`,
		...group.rows.map( rowMarkup )
	];
};

const titleMarkup = ( title ) => {
	if ( !title ) {
		return [];
	}

	if ( title.fallback ) {
		return [ `<caption>{{#if:${arg( title.source )}|${argValue( title.source )}|${title.fallback}}}</caption>` ];
	}

	return [ `{{#if:${arg( title.source )}|<caption>${argValue( title.source )}</caption>}}` ];
};

const conditionMarkup = ( schema ) => {
	const sources = new Set();

	if ( schema.title?.source ) {
		sources.add( schema.title.source );
	}

	for ( const image of schema.images || ( schema.image ? [ schema.image ] : [] ) ) {
		if ( image.source ) {
			sources.add( image.source );
		}

		if ( image.caption ) {
			sources.add( image.caption );
		}
	}

	for ( const item of schema.items ) {
		const rows = item.rows || [ item ];
		for ( const row of rows ) {
			for ( const name of row.condition || [ row.source ].filter( Boolean ) ) {
				sources.add( name );
			}
		}
	}

	return Array.from( sources ).map( ( name ) => arg( name ) ).join( '' );
};

const infobox = ( schema ) => {
	const parts = [
		`{{#if:${conditionMarkup( schema )}|<table class="infobox portable-infobox">`,
		...titleMarkup( schema.title )
	];

	for ( const image of schema.images || ( schema.image ? [ schema.image ] : [] ) ) {
		parts.push( ...imageMarkup( image.source, image.caption ) );
	}

	for ( const item of schema.items ) {
		if ( item.rows ) {
			parts.push( ...groupMarkup( item ) );
		} else {
			parts.push( rowMarkup( item ) );
		}
	}

	parts.push( '</table>}}' );

	return parts.join( '\n' );
};

const baseTemplateName = ( title ) => title.replace( /^Template:/, '' );

const collectParams = ( schema ) => {
	const params = [];
	const add = ( name ) => {
		if ( name && !params.includes( name ) ) {
			params.push( name );
		}
	};

	if ( schema.title?.source ) {
		add( schema.title.source );
	}

	for ( const image of schema.images || ( schema.image ? [ schema.image ] : [] ) ) {
		add( image.source );
		add( image.caption );
	}

	for ( const item of schema.items ) {
		const rows = item.rows || [ item ];
		for ( const row of rows ) {
			for ( const name of row.condition || [ row.source ].filter( Boolean ) ) {
				add( name );
			}
		}
	}

	return params;
};

const sampleValue = ( templateName, param ) => {
	if ( param === 'title' || param === 'title1' || param === 'name' ) {
		return `Example ${templateName}`;
	}

	if ( param === 'image' || param === 'image1' || param === 'map' ) {
		return 'Example.jpg';
	}

	if ( param === 'caption' || param === 'caption1' || param.endsWith( 'caption' ) ) {
		return 'Example image';
	}

	return 'Example';
};

const transclusion = ( template ) => {
	const name = baseTemplateName( template.title );
	const lines = [ `{{${name}` ];

	for ( const param of collectParams( template.schema ) ) {
		lines.push( `|${param}=${sampleValue( name, param )}` );
	}

	lines.push( '}}' );

	return lines.join( '\n' );
};

const documentation = ( template ) => {
	const example = transclusion( template );

	return `== Description ==
This template renders a MediaWiki-compatible infobox. Blank fields are hidden.

== Syntax ==
<pre>${example.replace( /=.+/g, '=' )}</pre>

== Sample output ==
${example}

<pre>${example}</pre>
<includeonly>[[Category:Infobox templates]]</includeonly><noinclude>[[Category:Template documentation]]</noinclude>
`;
};

const commonNoinclude = '<noinclude>{{Documentation}}</noinclude>';

const templates = [
	{
		title: 'Template:Album',
		schema: {
			title: { source: 'title' },
			image: { source: 'image', caption: 'imagecaption' },
			items: [
				{ source: 'artist', label: 'Artist' },
				{ source: 'released', label: 'Released' },
				{ source: 'recorded', label: 'Recorded' },
				{ source: 'length', label: 'Length' },
				{ source: 'label', label: 'Label' },
				{ source: 'producer', label: 'Producer' }
			]
		}
	},
	{
		title: 'Template:Book',
		category: '{{#ifeq: {{NAMESPACENUMBER}} | 0 | [[Category:Books]]}}',
		schema: {
			title: { source: 'title' },
			image: { source: 'image', caption: 'imagecaption' },
			items: [
				{ source: 'author', label: 'Author' },
				{ source: 'illustrator', label: 'Illustrator' },
				{ source: 'datePublished', label: 'Published on' },
				{ source: 'publisher', label: 'Publisher' },
				{
					header: 'Publication order',
					rows: [
						{ source: 'previous', label: 'Previous' },
						{ source: 'next', label: 'Next' }
					]
				}
			]
		}
	},
	{
		title: 'Template:Cast',
		category: '{{#ifeq: {{NAMESPACENUMBER}} | 0 | [[Category:Cast]]}}',
		schema: {
			title: { source: 'name', fallback: '{{PAGENAME}}' },
			image: { source: 'image', caption: 'caption' },
			items: [
				{
					condition: [ 'birthname', 'birthdate', 'birthplace' ],
					label: 'Born',
					value: `${arg( 'birthname' )}{{#if:${arg( 'birthdate' )}|{{#if:${arg( 'birthname' )}|<br />}}${argValue( 'birthdate' )}}}{{#if:${arg( 'birthplace' )}|{{#if:${arg( 'birthname' )}${arg( 'birthdate' )}|<br />}}${argValue( 'birthplace' )}}}`
				},
				{
					condition: [ 'deathdate', 'deathplace' ],
					label: 'Died',
					value: `${arg( 'deathdate' )}{{#if:${arg( 'deathplace' )}|{{#if:${arg( 'deathdate' )}|<br />}}${argValue( 'deathplace' )}}}`
				},
				{ source: 'gender', label: 'Gender' },
				{ source: 'height', label: 'Height' },
				{ source: 'occupation', label: 'Occupation' },
				{ source: 'appears in', label: 'Appears in' },
				{ source: 'portrays', label: 'Portrays' }
			]
		}
	},
	{
		title: 'Template:Character',
		category: '{{#ifeq: {{NAMESPACENUMBER}} | 0 | [[Category:Characters]]}}',
		schema: {
			title: { source: 'name' },
			image: { source: 'image', caption: 'imagecaption' },
			items: [
				{
					header: 'Personal information',
					rows: [
						{ source: 'aliases', label: 'Aliases' },
						{ source: 'relatives', label: 'Relatives' },
						{ source: 'affiliation', label: 'Affiliation' },
						{ source: 'occupation', label: 'Occupation' }
					]
				},
				{
					header: 'Biographical information',
					rows: [
						{ source: 'marital', label: 'Marital status' },
						{ source: 'birthDate', label: 'Date of birth' },
						{ source: 'birthPlace', label: 'Place of birth' },
						{ source: 'deathDate', label: 'Date of death' },
						{ source: 'deathPlace', label: 'Place of death' }
					]
				},
				{
					header: 'Physical description',
					rows: [
						{ source: 'species', label: 'Species' },
						{ source: 'gender', label: 'Gender' },
						{ source: 'height', label: 'Height' },
						{ source: 'weight', label: 'Weight' },
						{ source: 'eyes', label: 'Eye color' }
					]
				},
				{
					header: 'Appearances',
					rows: [
						{ source: 'portrayedby', label: 'Portrayed by' },
						{ source: 'appearsin', label: 'Appears in' },
						{ source: 'debut', label: 'Debut' }
					]
				}
			]
		}
	},
	{
		title: 'Template:Episode',
		category: '{{#ifeq: {{NAMESPACENUMBER}} | 0 | [[Category:Episodes]]}}',
		schema: {
			title: { source: 'title' },
			image: { source: 'image', caption: 'imagecaption' },
			items: [
				{ source: 'partOfSeason', label: 'Season' },
				{ source: 'episodeNumber', label: 'Episode' },
				{ source: 'airDate', label: 'Air date' },
				{ source: 'writer', label: 'Writer' },
				{ source: 'director', label: 'Director' },
				{
					header: 'Episode guide',
					rows: [
						{ source: 'previousEpisode', label: 'Previous' },
						{ source: 'nextEpisode', label: 'Next' }
					]
				}
			]
		}
	},
	{
		title: 'Template:Event',
		category: '{{#ifeq: {{NAMESPACENUMBER}} | 0 | [[Category:Events]]}}',
		schema: {
			title: { source: 'title' },
			image: { source: 'image', caption: 'imagecaption' },
			items: [
				{ source: 'performers', label: 'Performers' },
				{ source: 'date', label: 'Date' },
				{ source: 'location', label: 'Location' }
			]
		}
	},
	{
		title: 'Template:Film',
		category: '{{#ifeq: {{NAMESPACENUMBER}} | 0 | [[Category:Films]]}}',
		schema: {
			title: { source: 'title', fallback: "'' {{#explode:{{PAGENAME}}|(}} ''" },
			image: { source: 'image', caption: 'caption' },
			items: [
				{ source: 'premiere', label: 'Premiere date' },
				{ source: 'genre', label: 'Genre' },
				{ source: 'rating', label: 'Rating' },
				{ source: 'runtime', label: 'Runtime' },
				{ source: 'director', label: 'Directed by' },
				{ source: 'writer', label: 'Written by' },
				{ source: 'music', label: 'Music by' },
				{ source: 'producer', label: 'Produced by' },
				{ source: 'budget', label: 'Budget' },
				{ source: 'earned', label: 'Box office' },
				{
					header: 'Series',
					rows: [
						{ source: 'previous', label: 'Previous' },
						{ source: 'next', label: 'Next' }
					]
				}
			]
		}
	},
	{
		title: 'Template:Game',
		schema: {
			title: { source: 'title', fallback: '{{PAGENAME}}' },
			image: { source: 'image', caption: 'caption' },
			items: [
				{ source: 'developer', label: 'Developer' },
				{ source: 'publisher', label: 'Publisher' },
				{ source: 'engine', label: 'Engine' },
				{ source: 'version', label: 'Version' },
				{ source: 'platform', label: 'Platform' },
				{ source: 'releasedate', label: 'Release date' },
				{ source: 'genre', label: 'Genre' },
				{ source: 'mode', label: 'Mode' },
				{ source: 'rating', label: 'Rating' },
				{ source: 'media', label: 'Media' },
				{
					header: 'System requirements',
					rows: [
						{ source: 'requirements', label: 'Requirements' }
					]
				}
			]
		}
	},
	{
		title: 'Template:Item',
		category: '{{#ifeq: {{NAMESPACENUMBER}} | 0 | [[Category:Items]]}}',
		schema: {
			title: { source: 'title' },
			image: { source: 'image', caption: 'imagecaption' },
			items: [
				{ source: 'type', label: 'Type' },
				{ source: 'effects', label: 'Effects' },
				{ source: 'source', label: 'Source' },
				{ source: 'buy', label: 'Cost to buy' },
				{ source: 'sell', label: 'Cost to sell' }
			]
		}
	},
	{
		title: 'Template:Location',
		category: '{{#ifeq: {{NAMESPACENUMBER}} | 0 | [[Category:Locations]]}}',
		schema: {
			title: { source: 'title' },
			images: [
				{ source: 'image', caption: 'imagecaption' },
				{ source: 'map', caption: 'mapcaption' }
			],
			items: [
				{ source: 'type', label: 'Type' },
				{ source: 'level', label: 'Level' },
				{ source: 'location', label: 'Location' },
				{ source: 'inhabitants', label: 'Inhabitants' }
			]
		}
	},
	{
		title: 'Template:Quest',
		category: '{{#ifeq: {{NAMESPACENUMBER}} | 0 | [[Category:Quests]]}}',
		schema: {
			title: { source: 'title' },
			image: { source: 'image', caption: 'imagecaption' },
			items: [
				{ source: 'start', label: 'Start' },
				{ source: 'end', label: 'End' },
				{ source: 'prerequisites', label: 'Prerequisites' },
				{ source: 'level', label: 'Level' },
				{ source: 'location', label: 'Location' },
				{ source: 'rewards', label: 'Rewards' },
				{
					header: 'Quest progression',
					rows: [
						{ source: 'previous', label: 'Previous' },
						{ source: 'next', label: 'Next' }
					]
				}
			]
		}
	},
	{
		title: 'Template:Season',
		category: '{{#ifeq: {{NAMESPACENUMBER}} | 0 | [[Category:Seasons]]}}',
		schema: {
			title: { source: 'title', fallback: '{{PAGENAME}}' },
			image: { source: 'image', caption: 'caption' },
			items: [
				{ source: 'season', label: 'Season' },
				{ source: 'episodes', label: 'Episodes' },
				{ source: 'premiere', label: 'Premiered' },
				{
					header: 'Navigation',
					rows: [
						{ source: 'previous', label: 'Previous' },
						{ source: 'next', label: 'Next' }
					]
				}
			]
		}
	},
	{
		title: 'Template:Series',
		schema: {
			title: { source: 'title', fallback: "'' {{#explode:{{PAGENAME}}|(}} ''" },
			image: { source: 'image', caption: 'caption' },
			items: [
				{ source: 'release', label: 'First released' },
				{ source: 'seasons', label: 'Seasons' },
				{ source: 'episodes', label: 'Episodes' },
				{ source: 'runtime', label: 'Run time' },
				{ source: 'genre', label: 'Genre' },
				{ source: 'network', label: 'Network' },
				{ source: 'distrib', label: 'Distributor' },
				{ source: 'creator', label: 'Created by' },
				{ source: 'writer', label: 'Written by' },
				{ source: 'director', label: 'Directed by' },
				{ source: 'composer', label: 'Composer' },
				{ source: 'based on', label: 'Based on' },
				{ source: 'exec prod', label: 'Executive producer' },
				{ source: 'producer', label: 'Producer' },
				{ source: 'prod co', label: 'Production company' },
				{ source: 'country', label: 'Country' },
				{ source: 'language', label: 'Language' }
			]
		}
	},
	{
		title: 'Template:Simple member infobox i think',
		schema: {
			title: { source: 'title1', fallback: '{{PAGENAME}}' },
			image: { source: 'image1', caption: 'caption1' },
			items: [
				{
					header: 'Personal info',
					rows: [
						{ source: 'name', label: 'Name' },
						{ source: 'birthplace', label: 'Birthplace' },
						{ source: 'first_spotted_in', label: 'First spotted in' },
						{ source: 'nickname', label: 'Nickname' },
						{ source: 'role', label: 'Role' }
					]
				},
				{
					header: 'Involved in',
					rows: [
						{ source: 'major_events', label: 'Major events' },
						{ source: 'minor_events', label: 'Minor events' }
					]
				}
			]
		},
		noinclude: `<noinclude>
Example usage:
<pre>
{{Simple member infobox i think
 | title1 =
 | image1 =
 | caption1 =
 | name =
 | birthplace =
 | first_spotted_in =
 | nickname =
 | role =
 | major_events =
 | minor_events =
}}
</pre>
<templatedata>
{"params":{"title1":{"suggested":true},"image1":{"suggested":true},"caption1":{"suggested":true},"name":{"suggested":true},"birthplace":{"suggested":true},"first_spotted_in":{"suggested":true},"nickname":{"suggested":true},"role":{"suggested":true},"major_events":{"suggested":true},"minor_events":{"suggested":true}},"sets":[],"maps":{}}
</templatedata>
</noinclude>`
	}
];

for ( const template of templates ) {
	const text = `<includeonly>${infobox( template.schema )}${template.category || ''}</includeonly>${template.noinclude || commonNoinclude}\n`;
	const result = spawnSync(
		'docker',
		[
			'compose',
			'exec',
			'-T',
			'mediawiki',
			'php',
			'maintenance/run.php',
			'edit',
			'--user',
			'ryfried',
			'--summary',
			'Rewrite Fandom PortableInfobox template for MediaWiki rendering',
			template.title
		],
		{
			cwd: process.cwd(),
			encoding: 'utf8',
			input: text
		}
	);

	if ( result.status !== 0 ) {
		process.stderr.write( result.stderr );
		process.stdout.write( result.stdout );
		process.exit( result.status || 1 );
	}

	process.stdout.write( `${template.title}: rewritten\n` );

	if ( template.noinclude ) {
		continue;
	}

	const docTitle = `${template.title}/doc`;
	const docResult = spawnSync(
		'docker',
		[
			'compose',
			'exec',
			'-T',
			'mediawiki',
			'php',
			'maintenance/run.php',
			'edit',
			'--user',
			'ryfried',
			'--summary',
			'Rewrite infobox documentation for MediaWiki rendering',
			docTitle
		],
		{
			cwd: process.cwd(),
			encoding: 'utf8',
			input: documentation( template )
		}
	);

	if ( docResult.status !== 0 ) {
		process.stderr.write( docResult.stderr );
		process.stdout.write( docResult.stdout );
		process.exit( docResult.status || 1 );
	}

	process.stdout.write( `${docTitle}: rewritten\n` );
}
