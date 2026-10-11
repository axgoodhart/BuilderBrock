import type { MockupElementKind } from '../types';
import { LAYOUT_PRESETS } from './mockupBlueprint';
import type { LayoutPreset } from './mockupBlueprint';

type Elements = LayoutPreset['elements'];

export interface TemplateCategory {
    id: string;
    label: string;
    description: string;
    presets: LayoutPreset[];
}

const element = (kind: MockupElementKind, label: string, x: number, y: number, width: number, height: number): Elements[number] =>
    ({ kind, label, x, y, width, height });

const title = (label: string, x = 8, y = 8, width = 60) => element('title', label, x, y, width, 8);
const text = (label: string, x: number, y: number, width: number, height = 12) => element('text', label, x, y, width, height);
const button = (label: string, x: number, y: number, width = 22) => element('button', label, x, y, width, 7);
const image = (label: string, x: number, y: number, width: number, height: number) => element('image', label, x, y, width, height);
const card = (label: string, x: number, y: number, width: number, height: number) => element('card', label, x, y, width, height);

/** Content blocks keep previews and the stamped wireframe in the same paint order. */
function contentCard(label: string, x: number, y: number, width: number, height: number, withImage = false): Elements {
    const copyY = withImage ? y + height * 0.58 : y + 5;
    return [
        card(label, x, y, width, height),
        ...(withImage ? [image(`${label} image`, x + 2, y + 2, width - 4, height * 0.48)] : []),
        title(label, x + 3, copyY, width - 6),
        text(`${label} description`, x + 3, copyY + 9, width - 6, Math.max(4, y + height - copyY - 12)),
    ];
}

function grid(labels: string[], columns: number, y: number, height: number, withImage = false): Elements {
    const gap = 4;
    const width = (84 - gap * (columns - 1)) / columns;
    return labels.flatMap((label, i) => contentCard(label, 8 + (i % columns) * (width + gap), y + Math.floor(i / columns) * (height + gap), width, height, withImage));
}

function metric(label: string, value: string, x: number, y: number, width: number, height = 26): Elements {
    return [card(label, x, y, width, height), title(value, x + 3, y + 4, width - 6), text(label, x + 3, y + 14, width - 6, 6)];
}

function metrics(labels: string[], columns: number, y: number, height = 26): Elements {
    const width = (84 - 4 * (columns - 1)) / columns;
    const values = ['24.8k', '98%', '3.2×', '120+', '8.4k', '42%'];
    return labels.flatMap((label, i) => metric(label, values[i % values.length], 8 + (i % columns) * (width + 4), y + Math.floor(i / columns) * (height + 4), width, height));
}

function barChart(x: number, y: number, width: number, height: number): Elements {
    const heights = [0.32, 0.5, 0.42, 0.72, 0.62, 0.9];
    return [
        card('Performance chart', x, y, width, height),
        title('Performance', x + 3, y + 3, width - 6),
        ...heights.map((ratio, i) => element(i === 5 ? 'button' : 'image', `Chart bar ${i + 1}`, x + 4 + i * ((width - 8) / 6), y + height - 4 - (height - 18) * ratio, (width - 14) / 6, (height - 18) * ratio)),
    ];
}

function splitStory(label: string, reversed = false): Elements {
    const mediaX = reversed ? 54 : 8;
    const copyX = reversed ? 8 : 52;
    return [image(`${label} image`, mediaX, 10, 38, 72), title(label, copyX, 24, 40), text(`${label} story`, copyX, 36, 40, 22), button('Learn more', copyX, 66)];
}

function signup(label: string, x: number, y: number, width: number, stacked = false): Elements {
    return [
        element('input', 'Email address', x, y, stacked ? width : width * 0.64, 8),
        button(label, stacked ? x : x + width * 0.68, stacked ? y + 12 : y + 0.5, stacked ? width : width * 0.32),
    ];
}

type Variant = readonly [id: string, label: string, elements: Elements];
function category(id: string, label: string, description: string, variants: Variant[]): TemplateCategory {
    return { id, label, description, presets: variants.map<LayoutPreset>(([variantId, variantLabel, elements]) => ({ id: `${id}-${variantId}`, label: variantLabel, group: 'section', elements })) };
}

const stats = category('stats', 'Stats', 'Statistics and metrics sections with various layouts and styles', [
    ['chart-split', 'Metrics + chart', [title('Growth at a glance', 8, 28, 28), text('Your key results', 8, 40, 28), ...barChart(42, 8, 50, 74)]],
    ['row', 'Four key numbers', [title('By the numbers'), ...metrics(['Customers', 'Satisfaction', 'Growth', 'Countries'], 4, 28)]],
    ['grid', 'Metric grid', [title('Our impact'), ...metrics(['Customers', 'Satisfaction', 'Growth', 'Countries', 'Projects', 'Retention'], 3, 24)]],
    ['stack', 'Stacked metrics', [title('Results', 8, 28, 34), text('The numbers behind the work', 8, 40, 34), ...metric('Customers', '24.8k', 50, 8, 42, 22), ...metric('Satisfaction', '98%', 50, 34, 42, 22), ...metric('Growth', '3.2×', 50, 60, 42, 22)]],
    ['featured', 'Featured number', [...metric('Customers worldwide', '24.8k', 8, 8, 48, 70), ...metric('Satisfaction', '98%', 60, 8, 32, 32), ...metric('Growth', '3.2×', 60, 44, 32, 34)]],
    ['banner', 'Statistics banner', [card('Results banner', 5, 20, 90, 44), ...metrics(['Customers', 'Satisfaction', 'Growth'], 3, 29)]],
    ['dashboard', 'Dashboard overview', [title('Overview'), ...metrics(['Revenue', 'Orders', 'Conversion'], 3, 22, 22), ...barChart(8, 48, 84, 40)]],
    ['two-charts', 'Side-by-side charts', [title('Performance comparison'), ...barChart(8, 24, 40, 58), ...barChart(52, 24, 40, 58)]],
    ['sidebar', 'Dashboard + sidebar', [element('section', 'Dashboard navigation', 5, 6, 20, 82), title('Analytics', 30, 8, 60), ...metric('Revenue', '$84k', 30, 22, 28, 24), ...metric('Conversion', '8.4%', 62, 22, 30, 24), ...barChart(30, 50, 62, 38)]],
    ['progress', 'Goal progress', [title('Progress toward our goals'), ...['Revenue goal', 'New customers', 'Projects delivered'].flatMap((label, i) => [text(label, 8, 26 + i * 20, 32, 6), element('slider', label, 44, 27 + i * 20, 48, 4)])]],
    ['comparison', 'Before + after', [title('The difference we make'), ...metric('Before', '32%', 8, 26, 40, 48), ...metric('After', '98%', 52, 26, 40, 48)]],
    ['leaderboard', 'Ranked results', [title('Top performers'), ...['First place', 'Second place', 'Third place'].flatMap((label, i) => [card(label, 8, 24 + i * 20, 84, 16), text(label, 12, 29 + i * 20, 48, 6), element('chip', `${100 - i * 18} points`, 76, 29 + i * 20, 12, 5)])]],
    ['report', 'Report with summary', [title('Monthly report'), ...barChart(8, 24, 52, 60), title('Highlights', 65, 28, 27), text('Report summary', 65, 40, 27, 24)]],
    ['image', 'Impact + image', [image('Impact photograph', 8, 8, 40, 76), title('Our impact', 54, 10, 38), ...metric('Community members', '24.8k', 54, 24, 38, 26), ...metric('Countries reached', '120+', 54, 54, 38, 26)]],
    ['compact', 'Compact stat strip', [...['Customers', 'Satisfaction', 'Growth'].flatMap((label, i) => [title(['24.8k', '98%', '3.2×'][i], 8 + i * 29, 28, 26), text(label, 8 + i * 29, 40, 26, 8)])]],
]);

const errors = category('404', '404', '404 error pages with creative designs and helpful navigation', [
    ['browser', 'Browser error card', [card('Error window', 24, 20, 52, 44), element('navbar', 'Browser bar', 26, 22, 48, 6), title('404', 42, 34, 16), text('Page not found', 34, 45, 32, 6), button('Go home', 39, 55)]],
    ['centered', 'Centered message', [title('404', 35, 16, 30), title('Page not found', 25, 30, 50), text('This page has moved or no longer exists', 25, 43, 50), button('Back to home', 39, 62)]],
    ['split', 'Illustration + message', [image('Lost in space illustration', 8, 14, 40, 62), title('404', 54, 20, 38), title('A little lost?', 54, 32, 38), text('Find your way back', 54, 44, 38), button('Go home', 54, 64)]],
    ['search', 'Search to recover', [title('Nothing here yet', 24, 16, 52), text('Try searching for what you need', 24, 30, 52), element('input', 'Search the site', 24, 48, 36, 8), button('Search', 64, 48, 12), button('Go home', 39, 66)]],
    ['links', 'Helpful destinations', [title('404 — page not found', 18, 12, 64), text('Explore another part of the site', 18, 26, 64), ...grid(['Home', 'Help center', 'Contact'], 3, 44, 30)]],
    ['minimal', 'Minimal error', [title('404', 8, 24, 28), text('We could not find that page', 8, 38, 52), button('Return home', 8, 60)]],
    ['full-image', 'Full image backdrop', [image('Error page background', 5, 5, 90, 84), card('Error message', 24, 25, 52, 42), title('404', 42, 30, 16), text('Take a different path', 30, 42, 40), button('Go home', 39, 56)]],
    ['support', 'Error + support', [card('Page not found', 18, 12, 64, 68), title('404', 39, 20, 22), text('Need help finding something?', 26, 34, 48), button('Return home', 26, 54, 22), button('Contact support', 52, 54, 22), text('Support contact details', 26, 68, 48, 6)]],
]);

const profiles = category('profile', 'Profile', 'User profile sections with various layouts and information displays', [
    ['card', 'Centered profile card', [card('Profile', 24, 12, 52, 66), image('Avatar', 44, 18, 12, 16), title('Your name', 34, 38, 32), text('Bio and role', 32, 48, 36, 10), ...metrics(['Posts', 'Followers', 'Following'], 3, 62, 22).map(e => ({ ...e, x: 28 + (e.x - 8) * 0.52, width: e.width * 0.52, y: e.y - 4 }))]],
    ['cover', 'Cover + profile', [image('Cover image', 8, 8, 84, 30), image('Avatar', 12, 30, 16, 20), title('Your name', 32, 44, 38), text('Profile biography', 12, 56, 58, 18), button('Follow', 74, 46, 14)]],
    ['sidebar', 'Profile sidebar', [card('Profile sidebar', 8, 8, 28, 78), image('Avatar', 15, 14, 14, 18), title('Your name', 12, 38, 20), text('Bio and contact', 12, 50, 20, 20), button('Follow', 12, 74, 20), title('Recent activity', 42, 10, 50), ...grid(['Activity one', 'Activity two'], 1, 26, 24).map(e => ({ ...e, x: 42 + (e.x - 8) * 0.6, width: e.width * 0.6 }))]],
    ['portfolio', 'Creator portfolio', [image('Avatar', 8, 8, 14, 18), title('Creator name', 27, 10, 48), text('Creative focus and biography', 27, 22, 60, 10), ...grid(['Project one', 'Project two', 'Project three'], 3, 42, 44, true)]],
    ['settings', 'Profile + settings', [image('Avatar', 8, 12, 20, 26), title('Your profile', 36, 12, 56), element('input', 'Display name', 36, 28, 56, 8), element('input', 'Email address', 36, 42, 56, 8), element('input', 'Biography', 36, 56, 56, 16), button('Save changes', 70, 80)]],
    ['compact', 'Compact identity row', [card('Profile row', 8, 24, 84, 32), image('Avatar', 12, 30, 14, 20), title('Your name', 31, 30, 36), text('Role and location', 31, 42, 36, 8), button('View profile', 70, 36, 18)]],
]);

const about = category('about', 'About', 'About sections showcasing company story, mission, and team information', [
    ['story', 'Image + story', splitStory('Our story')],
    ['reverse', 'Story + image', splitStory('Who we are', true)],
    ['mission', 'Centered mission', [title('Our mission', 22, 14, 56), text('The purpose behind everything we do', 22, 30, 56, 24), button('Meet the team', 39, 64)]],
    ['team', 'Meet the team', [title('The people behind the work'), ...grid(['Team member one', 'Team member two', 'Team member three'], 3, 28, 54, true)]],
    ['values', 'Values grid', [title('What we believe'), ...grid(['Care', 'Curiosity', 'Craft'], 3, 26, 48)]],
    ['timeline', 'Company timeline', [title('Our journey'), ...['The beginning', 'First milestone', 'What comes next'].flatMap((label, i) => [element('chip', `Year ${i + 1}`, 8, 26 + i * 20, 16, 6), title(label, 30, 24 + i * 20, 60), text(`${label} story`, 30, 34 + i * 20, 60, 8)])]],
    ['founder', 'Founder spotlight', [image('Founder portrait', 8, 8, 34, 76), title('A note from our founder', 48, 14, 44), text('Founder letter', 48, 28, 44, 32), text('Name and role', 48, 68, 44, 8)]],
    ['collage', 'Photo collage + story', [image('Team at work', 8, 8, 24, 42), image('Studio', 36, 8, 24, 26), image('Community', 36, 38, 24, 42), title('Made with purpose', 66, 16, 26), text('Our story', 66, 30, 26, 28), button('Learn more', 66, 68, 26)]],
    ['impact', 'Story + impact', [title('Building a better future'), text('Our mission and story', 8, 24, 84, 18), ...metrics(['People reached', 'Projects completed', 'Years of experience'], 3, 54)]],
    ['video', 'Video introduction', [title('Get to know us', 24, 8, 52), image('Introduction video', 16, 24, 68, 54), button('Play video', 39, 48)]],
    ['editorial', 'Editorial story', [title('How it all began', 8, 8, 38), text('Opening story', 8, 24, 38, 54), image('Story photograph', 52, 8, 40, 34), text('The next chapter', 52, 48, 40, 30)]],
    ['locations', 'Our locations', [title('Where we work'), image('Locations map', 8, 26, 50, 56), title('Our offices', 64, 28, 28), text('Addresses and contact details', 64, 42, 28, 32)]],
]);

const waitlist = category('waitlist', 'Waitlist', 'Waitlist sections for collecting early sign-ups and pre-launch interest', [
    ['inline', 'Inline email signup', [title('Be first in line', 24, 22, 52), text('Get early access when we launch', 24, 36, 52, 10), ...signup('Join waitlist', 18, 54, 64), element('chip', 'Join our early supporters', 34, 72, 32, 5)]],
    ['card', 'Signup card', [card('Early access', 24, 8, 52, 78), title('Something good is coming', 30, 18, 40), text('Be the first to hear', 30, 34, 40), ...signup('Join waitlist', 30, 54, 40, true)]],
    ['split', 'Product preview + signup', [image('Product preview', 8, 10, 40, 70), title('Coming soon', 54, 20, 38), text('Sign up for early access', 54, 34, 38), ...signup('Join waitlist', 54, 54, 38, true)]],
    ['countdown', 'Launch countdown', [title('Launching soon', 24, 8, 52), ...metrics(['Days', 'Hours', 'Minutes'], 3, 24, 26), ...signup('Notify me', 22, 64, 56)]],
    ['benefits', 'Early access benefits', [title('Get a head start', 8, 12, 38), text('Early access benefits', 8, 28, 38, 32), card('Reserve your spot', 52, 8, 40, 70), title('Join the waitlist', 56, 18, 32), ...signup('Reserve my spot', 56, 38, 32, true)]],
    ['referral', 'Community + referral', [title('Build it with us', 24, 12, 52), text('Get early access and invite a friend', 24, 26, 52), ...[0, 1, 2, 3].map(i => image(`Member avatar ${i + 1}`, 32 + i * 10, 44, 8, 10)), ...signup('Join the community', 22, 64, 56)]],
]);

const showcase = category('showcase', 'Showcase', 'Showcase sections to highlight products, features, or portfolios', [
    ['carousel', 'Featured carousel', [title('Featured work', 28, 8, 44), image('Previous project', 5, 32, 14, 30), image('Featured project', 24, 22, 52, 48), image('Next project', 81, 32, 14, 30), element('chip', 'Slide indicators', 44, 78, 12, 4)]],
    ['grid', 'Project gallery', [title('Selected work'), ...grid(['Project one', 'Project two', 'Project three', 'Project four'], 2, 24, 30, true)]],
    ['featured', 'Hero project + details', [image('Featured project', 8, 8, 54, 76), title('Project spotlight', 68, 16, 24), text('Project details', 68, 30, 24, 28), button('View project', 68, 68, 24)]],
    ['mosaic', 'Mosaic gallery', [image('Featured work', 8, 8, 48, 76), image('Project two', 60, 8, 32, 36), image('Project three', 60, 48, 32, 36)]],
    ['devices', 'Device showcase', [title('Made for every screen'), image('Desktop preview', 8, 26, 60, 48), image('Mobile preview', 72, 34, 20, 48)]],
    ['comparison', 'Before + after showcase', [title('The transformation'), image('Before', 8, 26, 40, 50), image('After', 52, 26, 40, 50), element('slider', 'Before / after divider', 20, 84, 60, 4)]],
    ['case-study', 'Case study', [title('Project name', 8, 8, 38), text('Challenge, approach, and result', 8, 24, 38, 32), button('Read case study', 8, 68, 30), image('Case study image', 52, 8, 40, 76)]],
    ['filmstrip', 'Portfolio filmstrip', [title('Explore the collection'), ...grid(['Work one', 'Work two', 'Work three', 'Work four'], 4, 30, 42, true)]],
]);

function steps(vertical = false): Elements {
    return ['Choose your starting point', 'Make it your own', 'Publish your work'].flatMap((label, i) => {
        const x = vertical ? 8 : 8 + i * 29;
        const y = vertical ? 20 + i * 23 : 28;
        return [element('chip', `${i + 1}`, x, y, 8, 7), title(label, vertical ? 22 : x, vertical ? y : y + 14, vertical ? 70 : 26), text(`Step ${i + 1} explanation`, vertical ? 22 : x, vertical ? y + 10 : y + 26, vertical ? 70 : 26, 10)];
    });
}

const howItWorks = category('how-it-works', 'How It Works', 'Step-by-step process sections explaining how things work', [
    ['horizontal', 'Three-step process', [title('How it works'), ...steps()]],
    ['vertical', 'Vertical steps', [title('From idea to launch'), ...steps(true)]],
    ['cards', 'Step cards', [title('Three simple steps'), ...grid(['1. Choose', '2. Customize', '3. Publish'], 3, 26, 48)]],
    ['split', 'Demo + steps', [image('Process demo', 8, 8, 40, 76), title('How it works', 54, 8, 38), ...steps(true).map(e => ({ ...e, x: 54 + (e.x - 8) * 0.45, width: e.width * 0.45 }))]],
    ['alternating', 'Alternating walkthrough', [image('Step one illustration', 8, 20, 28, 26), title('1. Start with an idea', 42, 20, 50), text('Step one details', 42, 32, 50), title('2. Make it happen', 8, 56, 50), text('Step two details', 8, 68, 50), image('Step two illustration', 64, 56, 28, 26)]],
    ['four', 'Four-step roadmap', [title('Your path forward'), ...grid(['1. Discover', '2. Plan', '3. Build', '4. Launch'], 4, 28, 46)]],
    ['checklist', 'Getting started checklist', [title('Get started in minutes', 8, 14, 38), text('Everything you need to begin', 8, 30, 38), ...['Create your account', 'Choose a template', 'Add your content', 'Share your work'].map((label, i) => element('checkbox', label, 54, 18 + i * 14, 38, 7)), button('Get started', 54, 78)]],
    ['video', 'Video walkthrough', [title('See it in action', 24, 8, 52), image('Walkthrough video', 16, 24, 68, 44), button('Watch the demo', 36, 42, 28), ...['Choose', 'Customize', 'Publish'].map((label, i) => element('chip', `${i + 1}. ${label}`, 14 + i * 25, 78, 22, 6))]],
    ['workflow', 'Workflow stages', [title('A seamless workflow'), ...grid(['Input', 'Review', 'Output'], 3, 30, 40), button('Try the workflow', 36, 80, 28)]],
]);

const downloads = category('download', 'Download', 'Download sections for apps, files, and resources', [
    ['compact', 'Compact download card', [card('Download resource', 30, 24, 40, 30), title('Your next great resource', 34, 28, 32), text('File details', 34, 40, 32, 8), button('Download', 30, 62, 19), button('Preview', 52, 62, 18)]],
    ['app', 'App download + preview', [image('App preview', 8, 8, 32, 76), title('Take it with you', 48, 18, 44), text('Download the app', 48, 32, 44), button('App Store', 48, 54, 20), button('Google Play', 72, 54, 20)]],
    ['platforms', 'Choose your platform', [title('Download for your device'), ...grid(['macOS', 'Windows', 'Linux'], 3, 26, 38), ...['Download macOS', 'Download Windows', 'Download Linux'].map((label, i) => button(label, 11 + i * 29, 70, 22))]],
    ['resource', 'Resource spotlight', [image('Resource cover', 8, 12, 34, 66), title('The complete guide', 50, 16, 42), text('What is inside this resource', 50, 32, 42, 24), button('Download guide', 50, 66, 30)]],
    ['list', 'File download list', [title('Resources'), ...['Getting started guide', 'Template pack', 'Reference sheet'].flatMap((label, i) => [card(label, 8, 24 + i * 20, 84, 16), text(label, 12, 29 + i * 20, 50, 6), button('Download', 72, 28 + i * 20, 16)])]],
    ['qr', 'QR + mobile download', [image('Download QR code', 12, 20, 28, 36), title('Scan to download', 48, 22, 44), text('Open the app on your phone', 48, 36, 44), button('Get the app', 48, 58), text('Available for iOS and Android', 12, 72, 76, 8)]],
    ['release', 'Release details', [title('The latest release', 8, 12, 38), element('chip', 'Version 2.0', 8, 28, 20, 5), text('What is new', 8, 40, 38, 26), card('Download package', 52, 12, 40, 64), title('Ready to install', 56, 24, 32), text('Platform and file size', 56, 38, 32), button('Download', 56, 60, 32)]],
    ['email', 'Email-gated resource', [image('Resource preview', 8, 10, 36, 72), title('Send me the guide', 52, 16, 40), text('Enter your email to receive the download', 52, 32, 40), ...signup('Get the guide', 52, 54, 40, true)]],
]);

function articleRow(label: string, y: number): Elements {
    return [image(`${label} thumbnail`, 8, y, 18, 20), title(label, 30, y, 62), text('Article excerpt', 30, y + 10, 62, 8)];
}

const blog = category('blog', 'Blog', 'Blog sections and article layouts for content display', [
    ['list', 'Article list', [title('Latest stories'), ...articleRow('Story one', 26), ...articleRow('Story two', 54)]],
    ['grid', 'Article grid', [title('From the journal'), ...grid(['Story one', 'Story two', 'Story three'], 3, 28, 54, true)]],
    ['featured', 'Featured story + list', [title('The journal'), ...contentCard('Featured story', 8, 24, 44, 62, true), ...articleRow('Story two', 24).map(e => ({ ...e, x: 58 + (e.x - 8) * 0.4, width: e.width * 0.4 })), ...articleRow('Story three', 54).map(e => ({ ...e, x: 58 + (e.x - 8) * 0.4, width: e.width * 0.4 }))]],
    ['editorial', 'Editorial feature', [image('Lead story image', 8, 8, 52, 74), element('chip', 'Featured article', 66, 14, 26, 5), title('A story worth reading', 66, 26, 26), text('Lead story excerpt', 66, 40, 26, 22), button('Read story', 66, 72, 26)]],
    ['magazine', 'Magazine layout', [title('The latest issue'), ...contentCard('Cover story', 8, 24, 40, 60, true), ...contentCard('Story two', 52, 24, 40, 28), ...contentCard('Story three', 52, 56, 40, 28)]],
    ['article', 'Article page', [element('chip', 'Category · Reading time', 20, 8, 40, 5), title('Article headline', 20, 20, 60), text('Author and publication date', 20, 32, 60, 6), image('Article cover', 20, 44, 60, 28), text('Article body', 20, 78, 60, 16)]],
    ['sidebar', 'Article + sidebar', [title('Article headline', 8, 8, 54), text('Article body', 8, 24, 54, 62), title('On this page', 68, 8, 24), text('Table of contents', 68, 24, 24, 28), card('Related story', 68, 60, 24, 24)]],
    ['categories', 'Category tabs + stories', [title('Explore the journal'), ...['All', 'Design', 'Ideas', 'News'].map((label, i) => element('chip', label, 8 + i * 21, 22, 18, 5)), ...grid(['Story one', 'Story two', 'Story three'], 3, 36, 48, true)]],
    ['newsletter', 'Journal + newsletter', [title('Stories and ideas'), ...articleRow('Latest story', 24), card('Newsletter signup', 8, 56, 84, 32), title('Stay in the loop', 12, 60, 34), ...signup('Subscribe', 48, 68, 40)]],
    ['minimal', 'Text-first journal', [title('Notes from the studio'), ...['Story one', 'Story two', 'Story three'].flatMap((label, i) => [element('chip', 'Date', 8, 28 + i * 20, 14, 5), title(label, 28, 26 + i * 20, 64), text('Short article excerpt', 28, 36 + i * 20, 64, 8)])]],
    ['masonry', 'Masonry stories', [...contentCard('Story one', 8, 8, 40, 44, true), ...contentCard('Story two', 52, 8, 40, 32, true), ...contentCard('Story three', 8, 56, 40, 32, true), ...contentCard('Story four', 52, 44, 40, 44, true)]],
]);

function product(label: string, x: number, y: number, width: number, height: number): Elements {
    return [image(`${label} photo`, x, y, width, height - 18), title(label, x, y + height - 15, width), text('Price', x, y + height - 6, width, 5)];
}

const ecommerce = category('ecommerce', 'Ecommerce', 'Ecommerce sections for product pages, catalogs, and storefronts', [
    ['product', 'Product spotlight', [image('Product photo', 8, 12, 42, 66), title('Product name', 56, 18, 36), text('Product description and price', 56, 32, 36, 20), element('dropdown', 'Choose an option', 56, 58, 36, 6), button('Add to cart', 56, 72, 36)]],
    ['catalog', 'Product grid', [title('Shop the collection'), ...['Product one', 'Product two', 'Product three', 'Product four'].flatMap((label, i) => product(label, 8 + (i % 4) * 22, 28, 18, 54))]],
    ['filters', 'Catalog + filters', [element('section', 'Product filters', 5, 8, 22, 78), title('Filters', 8, 12, 16), ...['Category', 'Size', 'Color', 'Availability'].map((label, i) => element('checkbox', label, 8, 28 + i * 12, 16, 5)), title('Products', 32, 8, 60), ...['Product one', 'Product two', 'Product three'].flatMap((label, i) => product(label, 32 + i * 21, 26, 18, 58))]],
    ['storefront', 'Storefront hero', [element('navbar', 'Shop navigation', 5, 5, 90, 8), image('Collection campaign', 5, 18, 90, 68), card('Collection introduction', 10, 32, 36, 40), title('New collection', 14, 38, 28), text('Discover the latest arrivals', 14, 50, 28), button('Shop now', 14, 64)]],
    ['collections', 'Collection categories', [title('Find your favorite'), ...grid(['Collection one', 'Collection two', 'Collection three'], 3, 26, 54, true)]],
    ['gallery', 'Product gallery + options', [image('Main product photo', 8, 8, 44, 52), ...[0, 1, 2].map(i => image(`Product angle ${i + 1}`, 8 + i * 15, 64, 13, 18)), title('Product name', 58, 8, 34), text('Product details and price', 58, 24, 34, 18), element('dropdown', 'Size', 58, 48, 16, 6), element('dropdown', 'Color', 78, 48, 14, 6), element('input', 'Quantity', 58, 60, 16, 6), button('Add to cart', 58, 76, 34)]],
    ['cart', 'Shopping cart', [title('Your cart'), ...['Cart item one', 'Cart item two'].flatMap((label, i) => [image(label, 8, 24 + i * 28, 16, 22), title(label, 28, 24 + i * 28, 32), element('input', 'Quantity', 28, 36 + i * 28, 14, 6)]), card('Order summary', 66, 24, 26, 58), title('Summary', 70, 30, 18), text('Subtotal and shipping', 70, 44, 18, 16), button('Checkout', 70, 70, 18)]],
    ['checkout', 'Checkout form', [title('Checkout'), element('input', 'Full name', 8, 26, 50, 7), element('input', 'Email', 8, 38, 50, 7), element('input', 'Shipping address', 8, 50, 50, 12), element('input', 'Payment details', 8, 68, 50, 8), card('Order summary', 64, 26, 28, 58), text('Items and total', 68, 32, 20, 26), button('Place order', 68, 70, 20)]],
    ['featured', 'Featured product + grid', [title('Bestsellers'), ...product('Featured product', 8, 24, 40, 62), ...['Product two', 'Product three', 'Product four', 'Product five'].flatMap((label, i) => product(label, 54 + (i % 2) * 20, 24 + Math.floor(i / 2) * 32, 18, 28))]],
    ['reviews', 'Product + customer reviews', [image('Product photo', 8, 8, 36, 76), title('Made to be loved', 50, 8, 42), ...contentCard('Customer review one', 50, 24, 42, 24), ...contentCard('Customer review two', 50, 52, 42, 24), button('Shop now', 50, 82)]],
    ['offer', 'Promotional collection', [card('Seasonal offer', 8, 8, 84, 30), title('Discover something new', 12, 12, 54), text('Collection offer', 12, 24, 50, 6), button('Shop the offer', 68, 20, 20), ...['Product one', 'Product two', 'Product three'].flatMap((label, i) => product(label, 8 + i * 29, 46, 26, 42))]],
]);

/** Counts are derived from real editable layouts, never marketing placeholders. */
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
    stats, errors, profiles, about, waitlist, showcase, howItWorks, downloads, blog, ecommerce,
    { id: 'page', label: 'Page Layouts', description: 'Complete starting points for a landing page, split view, or mosaic', presets: LAYOUT_PRESETS.filter(p => p.group === 'page') },
    { id: 'section', label: 'More Sections', description: 'Navigation, heroes, features, pricing, contact forms, and more', presets: LAYOUT_PRESETS.filter(p => p.group === 'section') },
];
