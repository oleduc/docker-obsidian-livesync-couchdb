import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Represents a single CouchDB setting.
 *
 * @property section - The section in the config file (e.g., "chttpd").
 * @property key - The specific config key (e.g., "require_valid_user").
 * @property value - The value to set (e.g., "true").
 */
interface Setting {
  section: string;
  key: string;
  value: string;
}

/**
 * The location of the CouchDB config file to update.
 */
const CONFIG_FILE = path.resolve("/opt/couchdb/etc/local.ini");

/**
 * The Bash script (couchdb-init.sh) containing `curl` commands that
 * configure CouchDB at runtime. We parse these to extract the config
 * keys and values.
 */
const SCRIPT_FILE = path.resolve("./couchdb-init.sh");

/**
 * Parses the given Bash script, looking for `curl` commands
 * that configure CouchDB via the `_config` endpoint. It then
 * extracts each setting's section, key, and value.
 *
 * @param filePath - The path to the Bash script file.
 * @returns An array of `Setting` objects representing the configuration.
 * @throws If the file does not exist.
 */
function parseScript(filePath: string): Setting[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Script file not found: ${filePath}`);
  }

  const scriptLines = fs.readFileSync(filePath, "utf-8").split("\n");
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
 * Reads the CouchDB `local.ini` file, then updates or adds new settings
 * based on the parsed list from the Bash script. It preserves existing
 * structure, handling commented lines and appending new keys at the end
 * of each relevant section (or creating a new section if none is found).
 *
 * @param filePath - The path to the CouchDB `local.ini` file.
 * @param settings - The list of settings to apply.
 * @throws If the `local.ini` file does not exist.
 */
function updateConfig(filePath: string, settings: Setting[]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Configuration file not found: ${filePath}`);
  }

  const fileLines = fs.readFileSync(filePath, "utf-8").split("\n");
  const updatedLines: string[] = [];

  // Group all incoming settings by their section for easier processing
  const sectionSettings: Record<string, Setting[]> = {};
  for (const { section, key, value } of settings) {
    if (!sectionSettings[section]) {
      sectionSettings[section] = [];
    }
    sectionSettings[section].push({ section, key, value });
  }

  let currentSection = "";    // Name of the section we're currently parsing
  let sectionLines: string[] = []; // Lines belonging to the current section

  // Iterate over each line in the original file
  for (const line of fileLines) {
    const trimmed = line.trim();

    // Detect a new section (e.g., "[chttpd]")
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      // If we were processing a previous section, finalize it
      if (currentSection) {
        finalizeSection(
          currentSection,
          sectionLines,
          updatedLines,
          sectionSettings[currentSection]
        );
        // Remove these settings from the dictionary once processed
        delete sectionSettings[currentSection];
      }

      // Begin a new section
      currentSection = trimmed.slice(1, -1);
      sectionLines = [];
      updatedLines.push(line);
    } else if (currentSection) {
      // Still within the same section, collect the line for later processing
      sectionLines.push(line);
    } else {
      // Outside any section (e.g., initial comments or blank lines)
      updatedLines.push(line);
    }
  }

  // Finalize the last section if present
  if (currentSection) {
    finalizeSection(
      currentSection,
      sectionLines,
      updatedLines,
      sectionSettings[currentSection]
    );
    delete sectionSettings[currentSection];
  }

  // Add any sections from the script that were not present in the file
  for (const section in sectionSettings) {
    if (sectionSettings[section].length > 0) {
      updatedLines.push(`[${section}]`);
      for (const { key, value } of sectionSettings[section]) {
        updatedLines.push(`${key} = ${value}`);
      }
    }
  }

  // Write back the updated configuration
  fs.writeFileSync(filePath, updatedLines.join("\n"));
}

/**
 * Finalizes a section by scanning through its lines, uncommenting/updating
 * keys that match the desired settings, and appending any remaining keys
 * that weren't found in the file.
 *
 * @param section        - The name of the current section (e.g., "chttpd").
 * @param sectionLines   - The lines (settings or comments) that belong to this section.
 * @param updatedLines   - Accumulator array for the fully updated file.
 * @param settings       - The list of settings to apply in this section, if any.
 */
function finalizeSection(
  section: string,
  sectionLines: string[],
  updatedLines: string[],
  settings?: Setting[]
): void {
  // If there are no settings for this section, just copy lines as they are
  if (!settings || settings.length === 0) {
    updatedLines.push(...sectionLines);
    return;
  }

  // Convert settings into a Map for quick lookups and removals
  const remainingSettings = new Map<string, Setting>(
    settings.map((s) => [s.key, s])
  );

  // Process each line in the section
  for (const line of sectionLines) {
    const trimmed = line.trim();

    // Matches both commented and uncommented lines like:
    // max_document_size = 4294967296
    // ;max_document_size = 4294967296
    // capturing key and value as groups 1 & 2
    const match = trimmed.match(/\;?([\w\-]+)\s*=\s*(\w*)[\s\n]/);

    if (match) {
      const [, key] = match;

      // If this key is one we're supposed to update, do so
      if (remainingSettings.has(key)) {
        const { value: newValue } = remainingSettings.get(key)!;
        updatedLines.push(`${key} = ${newValue}`);
        remainingSettings.delete(key);
        continue;
      }
    }

    // Otherwise, keep the original line
    updatedLines.push(line);
  }

  // For any keys that didn't exist in the file, add them now
  remainingSettings.forEach(({ key, value }) => {
    updatedLines.push(`${key} = ${value}`);
  });
}

// --- SCRIPT EXECUTION ---

try {
  console.log("Parsing settings from the Bash script...");
  const settings = parseScript(SCRIPT_FILE);

  console.log("Updating CouchDB configuration...");
  updateConfig(CONFIG_FILE, settings);

  console.log("Configuration update complete.");
} catch (error) {
  console.error(`Error: ${(error as Error).message}`);
}