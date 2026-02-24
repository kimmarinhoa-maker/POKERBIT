const { createClient } = require('../apps/api/node_modules/@supabase/supabase-js');
require('../apps/api/node_modules/dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const tenants = await supabase.from('tenants').select('id').limit(1);
  const tid = tenants.data && tenants.data[0] ? tenants.data[0].id : null;
  console.log('Tenant ID:', tid);
  if (!tid) { console.log('No tenant found'); return; }

  // Simulate the preview flow for week 2026-02-16
  const weekStart = '2026-02-16';

  console.log('\n=== Step 2.5: Check existing settlement ===');
  const r1 = await supabase.from('settlements')
    .select('id, version, status')
    .eq('tenant_id', tid)
    .eq('week_start', weekStart)
    .order('version', { ascending: false }).limit(1);
  console.log('Settlement:', r1.data, 'err:', r1.error ? r1.error.message : 'none');

  if (r1.data && r1.data.length > 0) {
    const sid = r1.data[0].id;
    console.log('\n--- player_week_metrics for settlement ---');
    const r2 = await supabase.from('player_week_metrics')
      .select('id, rake_total_brl, ggr_brl')
      .eq('settlement_id', sid);
    console.log('data:', r2.data ? r2.data.length : null, 'err:', r2.error ? r2.error.message : 'none');

    console.log('\n--- agent_week_metrics for settlement ---');
    const r3 = await supabase.from('agent_week_metrics')
      .select('id, agent_name, subclub_name, rake_total_brl, ggr_total_brl')
      .eq('settlement_id', sid);
    console.log('data:', r3.data ? r3.data.length : null, 'err:', r3.error ? r3.error.message : 'none');

    console.log('\n--- organizations subclubs for dropdown ---');
    const r4 = await supabase.from('organizations')
      .select('id, name')
      .eq('tenant_id', tid)
      .eq('type', 'SUBCLUB')
      .eq('is_active', true)
      .order('name');
    console.log('data:', r4.data ? r4.data.length : null, 'err:', r4.error ? r4.error.message : 'none');
  }

  // Simulate detectWeekStart from filename
  console.log('\n=== detectWeekStart test ===');
  const XLSX = require('xlsx');
  const wb = XLSX.readFile('C:/Users/Kim Marinho.DESKTOP-AFVAA86/Downloads/106-343122-20260216-20260222 (1).xlsx');
  console.log('SheetNames:', wb.SheetNames);

  // Check first few rows for date patterns
  const sheet = wb.Sheets['Grand Union Member Resume'];
  if (sheet && sheet['!ref']) {
    console.log('Sheet ref:', sheet['!ref']);
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    console.log('First 5 rows:');
    for (var i = 0; i < Math.min(5, rows.length); i++) {
      var row = rows[i];
      var preview = (row || []).slice(0, 5).map(function(c) { return String(c).substring(0, 30); });
      console.log('  Row', i, ':', preview);
    }
  }

  console.log('\n=== FULL PREVIEW SIMULATION ===');
  try {
    const { parseWorkbook, validateReadiness } = require('../packages/importer/coreSuprema');

    // Load config (same as loadTenantConfig)
    var prefixRows = (await supabase.from('agent_prefix_map')
      .select('prefix, subclub_id, organizations!inner(name)')
      .eq('tenant_id', tid).eq('is_active', true)
      .order('priority', { ascending: false })).data || [];

    var prefixMap = {};
    prefixRows.forEach(function(r) {
      var clube = r.organizations ? r.organizations.name : '?';
      if (!prefixMap[clube]) prefixMap[clube] = [];
      prefixMap[clube].push(r.prefix);
    });
    var prefixRules = Object.entries(prefixMap).map(function(kv) { return { prefixes: kv[1], clube: kv[0] }; });

    var mlRows = (await supabase.from('agent_manual_links')
      .select('agent_name, subclub_id, organizations!inner(name)')
      .eq('tenant_id', tid)).data || [];
    var manualLinks = {};
    mlRows.forEach(function(r) { manualLinks[r.agent_name.toUpperCase().trim()] = r.organizations ? r.organizations.name : '?'; });

    var plRows = (await supabase.from('player_links')
      .select('external_player_id, agent_external_id, agent_name, subclub_id, organizations!inner(name)')
      .eq('tenant_id', tid)).data || [];
    var playerLinks = {};
    plRows.forEach(function(r) {
      playerLinks[r.external_player_id] = {
        agentId: r.agent_external_id || '',
        agentName: r.agent_name || '',
        subclube: r.organizations ? r.organizations.name : '?',
      };
    });

    var config = { agentOverrides: {}, manualLinks: manualLinks, prefixRules: prefixRules, playerLinks: playerLinks, ignoredAgents: {} };
    console.log('Config loaded: prefixRules=', prefixRules.length, 'manualLinks=', Object.keys(manualLinks).length, 'playerLinks=', Object.keys(playerLinks).length);

    var result = parseWorkbook(wb, config);
    console.log('Parse result: error=', result.error || 'none', 'all=', result.all ? result.all.length : 0);

    var v = validateReadiness(result);
    console.log('Readiness:', v.ready, 'blockers:', v.blockers.length);

    console.log('\n>>> SUCCESS: Preview would work');
  } catch (e) {
    console.error('\n>>> FAILED:', e.message);
    console.error(e.stack);
  }
}

test().catch(function(e) { console.error('FATAL:', e.message); });
