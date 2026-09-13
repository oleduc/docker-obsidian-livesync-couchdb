#!/usr/bin/env deno run --allow-net --allow-read --allow-write

/**
 * Compatibility test script for couchdb-setup.ts
 * Tests parsing logic against the remote CouchDB provisioning source
 */

import { exit } from "node:process";
import { parseProvisionScript } from "./couchdb-setup.ts";

const LIVESYNC_VERSION = (
  await Deno.readTextFile(new URL("./LIVESYNC_VERSION", import.meta.url))
).trim();
if (!/^[0-9a-f]{40}$/.test(LIVESYNC_VERSION)) {
  throw new Error("LIVESYNC_VERSION must contain a full Git commit SHA");
}

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

/**
 * Downloads the remote provision.ts source
 */
async function fetchRemoteScript(): Promise<string> {
  const response = await fetch(
    `https://raw.githubusercontent.com/vrtmrz/obsidian-livesync/${LIVESYNC_VERSION}/utils/couchdb/provision.ts`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch remote script: ${response.status}`);
  }

  return await response.text();
}

/**
 * Test that the production parser still matches the remote source format
 */
async function testRegexCompatibility(): Promise<TestResult> {
  try {
    const remoteScript = await fetchRemoteScript();
    const settings = parseProvisionScript(remoteScript);

    if (settings.length === 0) {
      return {
        success: false,
        message:
          "No settings parsed from remote script - regex pattern may be outdated",
        details: { scriptPreview: remoteScript.slice(0, 500) },
      };
    }

    return {
      success: true,
      message:
        `Successfully parsed ${settings.length} settings from remote script`,
      details: { settings: settings },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to test regex compatibility: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Test specific expected configuration settings
 */
async function testExpectedSettings(): Promise<TestResult> {
  try {
    const remoteScript = await fetchRemoteScript();
    const settings = parseProvisionScript(remoteScript);

    // Expected settings that should be present in a typical CouchDB setup
    const expectedKeys = [
      "chttpd/require_valid_user",
      "chttpd_auth/require_valid_user",
      "httpd/WWW-Authenticate",
      "httpd/enable_cors",
      "chttpd/enable_cors",
      "chttpd/max_http_request_size",
      "couchdb/max_document_size",
      "couchdb/single_node",
      "cors/credentials",
      "cors/origins",
    ];

    const foundKeys = settings.map((s) => `${s.section}/${s.key}`);
    const missingKeys = expectedKeys.filter((key) => !foundKeys.includes(key));

    if (missingKeys.length > 0) {
      return {
        success: false,
        message: `Missing expected configuration keys: ${
          missingKeys.join(", ")
        }`,
        details: { found: foundKeys, expected: expectedKeys },
      };
    }

    return {
      success: true,
      message: "All expected configuration settings found",
      details: { foundSettings: settings.length },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to test expected settings: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Test for breaking changes in script format
 */
async function testScriptFormat(): Promise<TestResult> {
  try {
    const remoteScript = await fetchRemoteScript();

    // Check for expected patterns in the provisioning source
    const hasSettingsArray = remoteScript.includes("const settings:");
    const hasConfigEndpoint = remoteScript.includes("/_config/");
    const hasNodePath = remoteScript.includes("/_node/");

    const issues: string[] = [];

    if (!hasSettingsArray) issues.push("Missing settings array");
    if (!hasConfigEndpoint) issues.push("Missing _config endpoint references");
    if (!hasNodePath) issues.push("Missing /_node/ path structure");

    if (issues.length > 0) {
      return {
        success: false,
        message: `Script format issues detected: ${issues.join(", ")}`,
        details: { issues },
      };
    }

    return {
      success: true,
      message: "Script format appears compatible",
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to test script format: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Save remote script locally for manual inspection
 */
async function saveRemoteScript(): Promise<void> {
  try {
    const remoteScript = await fetchRemoteScript();
    await Deno.writeTextFile("./downloaded-provision.ts", remoteScript);
    console.log("✓ Remote source saved as downloaded-provision.ts");
  } catch (error) {
    console.log(
      `✗ Failed to save remote script: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Generate detailed compatibility report
 */
async function generateReport(): Promise<boolean> {
  console.log("🔍 CouchDB Setup Compatibility Test");
  console.log("=".repeat(50));

  const tests = [
    { name: "Regex Pattern Compatibility", test: testRegexCompatibility },
    { name: "Expected Settings Validation", test: testExpectedSettings },
    { name: "Script Format Check", test: testScriptFormat },
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
      console.log(
        `💥 ERROR: ${error instanceof Error ? error.message : String(error)}`,
      );
      allPassed = false;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(
    `🎯 Overall Result: ${allPassed ? "✅ COMPATIBLE" : "❌ INCOMPATIBLE"}`,
  );

  if (!allPassed) {
    console.log("\n⚠️  Action Required:");
    console.log("   - Review the downloaded script for changes");
    console.log("   - Update regex patterns in couchdb-setup.ts if needed");
    console.log("   - Test with actual CouchDB configuration");
    return false;
  }
  return true;
}

// Main execution
if (import.meta.main) {
  console.log("🚀 Starting compatibility test...\n");

  await saveRemoteScript();
  const isSuccess = await generateReport();

  console.log("\n📝 Recommendation:");
  console.log("   Run this test regularly to ensure ongoing compatibility");
  console.log("   especially before deploying new versions.");
  exit(Number(!isSuccess));
}
