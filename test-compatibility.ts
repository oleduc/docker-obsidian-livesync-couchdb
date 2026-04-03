#!/usr/bin/env deno run --allow-net --allow-read --allow-write

/**
 * Compatibility test script for couchdb-setup.ts
 * Tests parsing logic against the remote couchdb-init.sh script
 */

// Note: Running in Deno container - imports will resolve correctly there
import { assertEquals, assertExists } from "@std/assert";
import { exit } from 'node:process';

interface Setting {
  section: string;
  key: string;
  value: string;
}

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

/**
 * Downloads the remote couchdb-init.sh script
 */
async function fetchRemoteScript(): Promise<string> {
  const response = await fetch(
    "https://raw.githubusercontent.com/vrtmrz/obsidian-livesync/main/utils/couchdb/couchdb-init.sh"
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch remote script: ${response.status}`);
  }
  
  return await response.text();
}

/**
 * Parses curl commands from the bash script - matches couchdb-setup.ts logic
 */
function parseScript(scriptContent: string): Setting[] {
  const scriptLines = scriptContent.split("\n");
  const settings: Setting[] = [];

  for (const line of scriptLines) {
    const trimmed = line.trim();

    // Regex to match lines like:
    // curl -X PUT "${hostname}/_node/${node}/_config/chttpd/require_valid_user" -d '"true"' ...
    const match = trimmed.match(
      /curl.*\/_node\/[^/]+\/_config\/([\w\-\/]+).*?-d\s+\'\"(.*?)\"\'.*$/i
    );

    if (match) {
      const [, fullKey, value] = match;
      
      // "fullKey" looks like "chttpd/require_valid_user"
      // Split on the first slash to separate section from key
      const [section, key] = fullKey.split("/", 2);
      
      settings.push({ section, key, value });
    }
  }

  return settings;
}

/**
 * Test that the regex pattern still matches the remote script format
 */
async function testRegexCompatibility(): Promise<TestResult> {
  try {
    const remoteScript = await fetchRemoteScript();
    const settings = parseScript(remoteScript);
    
    if (settings.length === 0) {
      return {
        success: false,
        message: "No settings parsed from remote script - regex pattern may be outdated",
        details: { scriptPreview: remoteScript.slice(0, 500) }
      };
    }

    return {
      success: true,
      message: `Successfully parsed ${settings.length} settings from remote script`,
      details: { settings: settings }
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to test regex compatibility: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Test specific expected configuration settings
 */
async function testExpectedSettings(): Promise<TestResult> {
  try {
    const remoteScript = await fetchRemoteScript();
    const settings = parseScript(remoteScript);
    
    // Expected settings that should be present in a typical CouchDB setup
    const expectedKeys = [
      "chttpd/require_valid_user",
      "chttpd/max_http_request_size", 
      "couchdb/max_document_size"
    ];
    
    const foundKeys = settings.map(s => `${s.section}/${s.key}`);
    const missingKeys = expectedKeys.filter(key => !foundKeys.includes(key));
    
    if (missingKeys.length > 0) {
      return {
        success: false,
        message: `Missing expected configuration keys: ${missingKeys.join(", ")}`,
        details: { found: foundKeys, expected: expectedKeys }
      };
    }

    return {
      success: true,
      message: "All expected configuration settings found",
      details: { foundSettings: settings.length }
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to test expected settings: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Test for breaking changes in script format
 */
async function testScriptFormat(): Promise<TestResult> {
  try {
    const remoteScript = await fetchRemoteScript();
    
    // Check for expected patterns in the script
    const hasConfigEndpoint = remoteScript.includes("/_config/");
    const hasCurlCommands = remoteScript.includes("curl");
    const hasNodePath = remoteScript.includes("/_node/nonode@nohost/");
    
    const issues: string[] = [];
    
    if (!hasConfigEndpoint) issues.push("Missing _config endpoint references");
    if (!hasCurlCommands) issues.push("Missing curl commands");
    if (!hasNodePath) issues.push("Missing nonode@nohost path structure");
    
    if (issues.length > 0) {
      return {
        success: false,
        message: `Script format issues detected: ${issues.join(", ")}`,
        details: { issues }
      };
    }

    return {
      success: true,
      message: "Script format appears compatible",
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to test script format: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Save remote script locally for manual inspection
 */
async function saveRemoteScript(): Promise<void> {
  try {
    const remoteScript = await fetchRemoteScript();
    await Deno.writeTextFile("./downloaded-couchdb-init.sh", remoteScript);
    console.log("✓ Remote script saved as downloaded-couchdb-init.sh");
  } catch (error) {
    console.log(`✗ Failed to save remote script: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate detailed compatibility report
 */
async function generateReport(): Promise<boolean> {
  console.log("🔍 CouchDB Setup Compatibility Test");
  console.log("=" .repeat(50));
  
  const tests = [
    { name: "Regex Pattern Compatibility", test: testRegexCompatibility },
    { name: "Expected Settings Validation", test: testExpectedSettings },
    { name: "Script Format Check", test: testScriptFormat }
  ];
  
  let allPassed = true;
  
  for (const { name, test } of tests) {
    console.log(`\n📋 ${name}`);
    console.log("-".repeat(30));
    
    try {
      const result = await test();
      
      if (result.success) {
        console.log(`✅ PASS: ${result.message}`);
        if (result.details) {
          console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
        }
      } else {
        console.log(`❌ FAIL: ${result.message}`);
        if (result.details) {
          console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
        }
        allPassed = false;
      }
    } catch (error) {
      console.log(`💥 ERROR: ${error instanceof Error ? error.message : String(error)}`);
      allPassed = false;
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log(`🎯 Overall Result: ${allPassed ? "✅ COMPATIBLE" : "❌ INCOMPATIBLE"}`);
  
  if (!allPassed) {
    console.log("\n⚠️  Action Required:");
    console.log("   - Review the downloaded script for changes");
    console.log("   - Update regex patterns in couchdb-setup.ts if needed");
    console.log("   - Test with actual CouchDB configuration");
    return false
  }
  return true
}

// Main execution
if (import.meta.main) {
  console.log("🚀 Starting compatibility test...\n");
  
  await saveRemoteScript();
  const isSuccess = await generateReport();
  
  console.log("\n📝 Recommendation:");
  console.log("   Run this test regularly to ensure ongoing compatibility");
  console.log("   especially before deploying new versions.");
  exit(Number(!isSuccess))
}