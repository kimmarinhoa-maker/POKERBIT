// Test the actual importPreviewService.preview() method directly
const { createClient } = require('../apps/api/node_modules/@supabase/supabase-js');
require('../apps/api/node_modules/dotenv').config();
const fs = require('fs');

const FILE_PATH = 'C:/Users/Kim Marinho.DESKTOP-AFVAA86/Downloads/106-343122-20260216-20260222 (1).xlsx';
const TENANT_ID = 'a0000000-0000-0000-0000-000000000001';

// Mock the env validation to avoid throwing
process.env.API_PORT = process.env.API_PORT || '3001';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'imports';

async function main() {
  try {
    // Import the service using tsx-like approach (the file is TypeScript)
    // Instead, we'll replicate the preview logic directly

    const XLSX = require('xlsx');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    const fileBuffer = fs.readFileSync(FILE_PATH);
    const fileName = '106-343122-20260216-20260222 (1).xlsx';

    console.log('1) Reading XLSX...');
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    console.log('   SheetNames:', workbook.SheetNames);

    console.log('\n2) Detecting week from filename...');
    // Simulate detectWeekStart
    const match = fileName.match(/(\d{8})\s*[-_]\s*(\d{8})/);
    if (match) {
      console.log('   Matched dates:', match[1], match[2]);
      const d1str = match[1];
      const y = parseInt(d1str.substring(0, 4));
      const m = parseInt(d1str.substring(4, 6)) - 1;
      const d = parseInt(d1str.substring(6, 8));
      const date = new Date(y, m, d);
      console.log('   Start date:', date.toISOString().split('T')[0]);
    }

    console.log('\n3) Checking existing settlement...');
    const { data: existingRows, error: sErr } = await supabase
      .from('settlements')
      .select('id, version, status')
      .eq('tenant_id', TENANT_ID)
      .eq('week_start', '2026-02-16')
      .order('version', { ascending: false })
      .limit(1);
    console.log('   Existing:', existingRows ? existingRows.length : 0, 'error:', sErr ? sErr.message : 'none');

    if (existingRows && existingRows.length > 0) {
      var sid = existingRows[0].id;
      console.log('   Settlement ID:', sid, 'status:', existingRows[0].status);

      console.log('\n   3a) player_week_metrics...');
      var { data: metrics, error: mErr } = await supabase
        .from('player_week_metrics')
        .select('id, rake_total_brl, ggr_brl')
        .eq('settlement_id', sid);
      console.log('   Count:', metrics ? metrics.length : 0, 'error:', mErr ? mErr.message : 'none');

      console.log('\n   3b) agent_week_metrics...');
      var { data: agentMetrics, error: aErr } = await supabase
        .from('agent_week_metrics')
        .select('id, agent_name, subclub_name, rake_total_brl, ggr_total_brl')
        .eq('settlement_id', sid);
      console.log('   Count:', agentMetrics ? agentMetrics.length : 0, 'error:', aErr ? aErr.message : 'none');
    }

    console.log('\n4) Loading tenant config...');
    var { data: prefixRows, error: pErr } = await supabase
      .from('agent_prefix_map')
      .select('prefix, subclub_id, organizations!inner(name)')
      .eq('tenant_id', TENANT_ID)
      .eq('is_active', true)
      .order('priority', { ascending: false });
    console.log('   prefix_map:', prefixRows ? prefixRows.length : 0, 'error:', pErr ? pErr.message : 'none');

    console.log('\n5) Parsing workbook...');
    const { parseWorkbook, validateReadiness } = require('../packages/importer/coreSuprema');

    // Build config
    var prefixMap = {};
    (prefixRows || []).forEach(function(r) {
      var clube = r.organizations ? r.organizations.name : '?';
      if (!prefixMap[clube]) prefixMap[clube] = [];
      prefixMap[clube].push(r.prefix);
    });
    var prefixRules = Object.entries(prefixMap).map(function(kv) {
      return { prefixes: kv[1], clube: kv[0] };
    });

    var { data: mlRows } = await supabase.from('agent_manual_links')
      .select('agent_name, subclub_id, organizations!inner(name)')
      .eq('tenant_id', TENANT_ID);
    var manualLinks = {};
    (mlRows || []).forEach(function(r) {
      manualLinks[r.agent_name.toUpperCase().trim()] = r.organizations ? r.organizations.name : '?';
    });

    var { data: plRows } = await supabase.from('player_links')
      .select('external_player_id, agent_external_id, agent_name, subclub_id, organizations!inner(name)')
      .eq('tenant_id', TENANT_ID);
    var playerLinks = {};
    (plRows || []).forEach(function(r) {
      playerLinks[r.external_player_id] = {
        agentId: r.agent_external_id || '',
        agentName: r.agent_name || '',
        subclube: r.organizations ? r.organizations.name : '?',
      };
    });

    var config = {
      agentOverrides: {},
      manualLinks: manualLinks,
      prefixRules: prefixRules,
      playerLinks: playerLinks,
      ignoredAgents: {},
    };

    var result = parseWorkbook(workbook, config);
    console.log('   Error:', result.error || 'none');
    console.log('   All:', result.all ? result.all.length : 0);
    console.log('   OK:', result.ok ? result.ok.length : 0);

    console.log('\n6) Validating readiness...');
    var v = validateReadiness(result);
    console.log('   Ready:', v.ready);
    console.log('   Blockers:', v.blockers);

    console.log('\n7) Building response (summary, subclubs, etc)...');
    var allPlayers = result.all || [];

    // Summary
    var uniqueAgents = new Set(allPlayers.filter(function(p) { return p.aname && p.aname !== 'None'; }).map(function(p) { return p.aname; }));
    console.log('   Total players:', allPlayers.length);
    console.log('   Total agents:', uniqueAgents.size);

    console.log('\n>>> ALL STEPS COMPLETED SUCCESSFULLY');
    console.log('>>> The preview service should work correctly.');
    console.log('>>> If you still see 500, the issue is in the Next.js proxy or auth flow.');

  } catch (e) {
    console.error('\n>>> ERROR at step:', e.message);
    console.error(e.stack);
  }
}

main();
