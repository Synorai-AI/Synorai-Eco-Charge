(function () {
  if (window.__synoraiEcoChargeStandardLoaded) return;
  window.__synoraiEcoChargeStandardLoaded = true;

  function getConfigElement() {
    return document.getElementById("synorai-ecocharge-standard-config");
  }

  function readConfig() {
    var el = getConfigElement();

    if (!el) {
      console.log("[Synorai EcoCharge] No standard config found on this page.");
      return null;
    }

    try {
      return JSON.parse(el.textContent || "{}");
    } catch (error) {
      console.error("[Synorai EcoCharge] Failed to parse standard config JSON.", error, el.textContent);
      return null;
    }
  }

  function log() {
    if (!window.__SynoraiEcoChargeDebug) return;
    console.log.apply(console, ["[Synorai EcoCharge]"].concat(Array.prototype.slice.call(arguments)));
  }

  function isProvinceCode(value) {
    return value === "AB" || value === "BC" || value === "SK";
  }

  function normalizeProvinceCode(value) {
    if (typeof value !== "string") return null;
    var trimmed = value.trim().toUpperCase();
    return isProvinceCode(trimmed) ? trimmed : null;
  }

  var PROVINCE_CONFIG = {
    AB: {
      enabled: true,
      label: "AB Environmental Fee",
      feeByCategory: {
        computers: 0.45,
        laptops: 0.30,
        printers: 1.65,
        peripherals: 0,
        av: 0.55,
        cellphones: 0,
        "display-small": 1.30,
        "display-large": 1.30,
        "display-xlarge": 2.75,
        "all-in-one": 1.30,
        "small-appliances": 0.40,
        tools: 0.65
      }
    },
    BC: {
      enabled: true,
      label: "BC Environmental Fee",
      feeByCategory: {
        computers: 0.70,
        laptops: 0.45,
        printers: 6.50,
        peripherals: 0.35,
        av: 2.80,
        cellphones: 0.20,
        "display-small": 3.50,
        "display-large": 4.50,
        "display-xlarge": 7.75,
        "all-in-one": 3.50,
        "small-appliances": 0,
        tools: 0
      }
    },
    SK: {
      enabled: true,
      label: "SK Environmental Fee",
      feeByCategory: {
        computers: 0.80,
        laptops: 0.45,
        printers: 4.50,
        peripherals: 0.20,
        av: 1.25,
        cellphones: 0,
        "display-small": 1.80,
        "display-large": 3.10,
        "display-xlarge": 7.00,
        "all-in-one": 1.80,
        "small-appliances": 0,
        tools: 0
      }
    }
  };

  var TAG_CATEGORY_MAP = {
    "eco-category-computers": "computers",
    "eco-category-laptops": "laptops",
    "eco-category-printers": "printers",
    "eco-category-peripherals": "peripherals",
    "eco-category-av": "av",
    "eco-category-cellphones": "cellphones",
    "eco-category-display-small": "display-small",
    "eco-category-display-large": "display-large",
    "eco-category-display-xlarge": "display-xlarge",
    "eco-category-all-in-one": "all-in-one",
    "eco-category-monitor-small": "display-small",
    "eco-category-monitor-large": "display-large",
    "eco-category-monitor-xlarge": "display-xlarge",
    "eco-category-small-appliances": "small-appliances",
    "eco-category-tools": "tools"
  };

  function normalizeVariantMap(config) {
    if (!config) return null;

    if (config.variantMap && typeof config.variantMap === "object") {
      return config.variantMap;
    }

    if (config.variantMapJson && typeof config.variantMapJson === "object") {
      return config.variantMapJson;
    }

    if (config.variantMapJson && typeof config.variantMapJson === "string") {
      try {
        return JSON.parse(config.variantMapJson);
      } catch (error) {
        console.error("[Synorai EcoCharge] Failed to parse variantMapJson string.", error, config.variantMapJson);
        return null;
      }
    }

    return null;
  }

  function getBootstrapConfig() {
    var config = window.SynoraiEcoChargeConfig;

    if (!config || !config.enabled) {
      return { ok: false, error: "Synorai EcoCharge is not enabled." };
    }

    var province = normalizeProvinceCode(config.province);
    if (!province) {
      return { ok: false, error: "No valid province provided." };
    }

    var feeProductId =
      typeof config.feeProductId === "string" && config.feeProductId.trim().length > 0
        ? config.feeProductId.trim()
        : null;

    if (!feeProductId) {
      return { ok: false, error: "No Standard fee product ID provided." };
    }

    var variantMap = config.variantMap;
    if (!variantMap) {
      return { ok: false, error: "No Standard fee variant map provided." };
    }

    return {
      ok: true,
      province: province,
      feeProductId: feeProductId,
      variantMap: variantMap,
      autoRun: !!config.autoRun
    };
  }

  function extractNumericVariantId(variantId) {
    var raw = String(variantId || "").split("/").pop().trim();
    var numeric = Number(raw);

    if (!raw || !Number.isFinite(numeric) || numeric <= 0) {
      throw new Error("Invalid Shopify variant ID: " + variantId);
    }

    return numeric;
  }

  async function parseJsonResponse(response) {
    var data = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      var message =
        data &&
        typeof data === "object" &&
        typeof data.description === "string" &&
        data.description ||
        data &&
        typeof data === "object" &&
        typeof data.message === "string" &&
        data.message ||
        "Cart request failed with status " + response.status;

      throw new Error(message);
    }

    return data;
  }

  async function getAjaxCart() {
    var response = await fetch("/cart.js", {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      credentials: "same-origin"
    });

    return parseJsonResponse(response);
  }

  async function addAjaxCartItem(input) {
    var numericVariantId = extractNumericVariantId(input.variantId);

    var response = await fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        items: [
          {
            id: numericVariantId,
            quantity: input.quantity,
            properties: input.properties || {}
          }
        ]
      })
    });

    return parseJsonResponse(response);
  }

  async function changeAjaxCartLineQuantity(lineKey, quantity) {
    if (!String(lineKey || "").trim()) {
      throw new Error("Cart line key is required.");
    }

    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error("Invalid cart line quantity: " + quantity);
    }

    var response = await fetch("/cart/change.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        id: lineKey,
        quantity: quantity
      })
    });

    return parseJsonResponse(response);
  }

  async function removeAjaxCartLine(lineKey) {
    return changeAjaxCartLineQuantity(lineKey, 0);
  }

  function normalizeTags(tags) {
    if (Array.isArray(tags)) {
      return tags
        .map(function (tag) { return String(tag).trim(); })
        .filter(function (tag) { return tag.length > 0; });
    }

    if (typeof tags === "string") {
      return tags
        .split(",")
        .map(function (tag) { return tag.trim(); })
        .filter(function (tag) { return tag.length > 0; });
    }

    return [];
  }

  function toCartLineLike(line) {
    return {
      key: typeof line.key === "string" ? line.key : undefined,
      quantity: typeof line.quantity === "number" ? line.quantity : 0,
      product_id: typeof line.product_id === "number" ? line.product_id : null,
      variant_id: typeof line.variant_id === "number" ? line.variant_id : null,
      title: typeof line.title === "string" ? line.title : undefined,
      properties: line.properties || null,
      product: {
        title:
          typeof line.product_title === "string"
            ? line.product_title
            : typeof line.title === "string"
              ? line.title
              : undefined,
        tags: normalizeTags(line.tags)
      }
    };
  }

  function toMerchandiseLineInput(line) {
  var key = typeof line.key === "string" ? line.key.trim() : "";
  var quantity = typeof line.quantity === "number" ? line.quantity : 0;
  var title =
    typeof line.product_title === "string" && line.product_title.trim().length > 0
      ? line.product_title.trim()
      : typeof line.title === "string" && line.title.trim().length > 0
        ? line.title.trim()
        : "Item";

  var handle =
    typeof line.handle === "string" && line.handle.trim().length > 0
      ? line.handle.trim()
      : "";

  var productId =
    typeof line.product_id === "number" && Number.isFinite(line.product_id)
      ? line.product_id
      : null;

  if (!key || quantity <= 0) {
    return null;
  }

  return {
    key: key,
    quantity: quantity,
    title: title,
    handle: handle,
    productId: productId,
    tags: normalizeTags(line.tags)
  };
}

var __synoraiProductTagCache = {};

async function getProductJsonByHandle(handle) {
  var normalizedHandle =
    typeof handle === "string" ? handle.trim() : "";

  if (!normalizedHandle) {
    return null;
  }

  if (__synoraiProductTagCache[normalizedHandle]) {
    return __synoraiProductTagCache[normalizedHandle];
  }

  var request = fetch("/products/" + encodeURIComponent(normalizedHandle) + ".js", {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    credentials: "same-origin"
  })
    .then(parseJsonResponse)
    .catch(function (error) {
      log("Failed to load product JSON for handle:", normalizedHandle, error);
      return null;
    });

  __synoraiProductTagCache[normalizedHandle] = request;
  return request;
}

async function resolveTagsForMerchandiseLine(line) {
  var inlineTags = normalizeTags(line && line.tags);
  if (inlineTags.length > 0) {
    return inlineTags;
  }

  var handle =
    line && typeof line.handle === "string" ? line.handle.trim() : "";

  if (!handle) {
    log("No handle available for merchandise line tag lookup:", line);
    return [];
  }

  var product = await getProductJsonByHandle(handle);
  if (!product) {
    log("No product JSON returned for handle:", handle);
    return [];
  }

  var resolvedTags = normalizeTags(product.tags);

  log("Resolved product tags from /products/<handle>.js:", {
    handle: handle,
    tags: resolvedTags
  });

  return resolvedTags;
}

  function numericVariantIdToGid(variantId) {
    if (!variantId || !Number.isFinite(variantId)) return null;
    return "gid://shopify/ProductVariant/" + variantId;
  }

  function getVariantMapEntryByVariantId(variantMap, variantId) {
    var provinces = Object.keys(variantMap || {});
    for (var i = 0; i < provinces.length; i += 1) {
      var province = provinces[i];
      var provinceMap = variantMap[province];
      if (!provinceMap) continue;

      var categories = Object.keys(provinceMap);
      for (var j = 0; j < categories.length; j += 1) {
        var category = categories[j];
        var entry = provinceMap[category];
        if (!entry) continue;

        if (entry.variantId === variantId) {
          return { province: province, category: category, entry: entry };
        }
      }
    }

    return null;
  }

  function isSynoraiFeeLine(line, feeProductId, variantMap) {
    var numericVariantId = line.variant_id || null;
    var gidVariantId = numericVariantIdToGid(numericVariantId);

    if (gidVariantId) {
      var matchedByVariant = getVariantMapEntryByVariantId(variantMap, gidVariantId);
      if (matchedByVariant) return true;
    }

    var props = line.properties || {};
    if (props && String(props._synorai_fee || "") === "true") {
      return true;
    }

    if (feeProductId && line.product_id) {
      var numericProductId = String(feeProductId).split("/").pop();
      if (numericProductId && String(line.product_id) === numericProductId) {
        return true;
      }
    }

    return false;
  }

  function parseStandardCart(items, feeProductId, variantMap) {
    var merchandiseLines = [];
    var feeLines = [];

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var cartLine = toCartLineLike(item);

      if (isSynoraiFeeLine(cartLine, feeProductId, variantMap)) {
        feeLines.push(cartLine);
        continue;
      }

      var merchandiseLine = toMerchandiseLineInput(item);
      if (merchandiseLine) {
        merchandiseLines.push(merchandiseLine);
      }
    }

    return {
      merchandiseLines: merchandiseLines,
      feeLines: feeLines
    };
  }

  function toTagStates(tags) {
    return tags.map(function (tag) {
      return { tag: tag, hasTag: true };
    });
  }

  function resolveHighestFeeCategoryFromTags(ecoCategoryTags, feeByCategory) {
    if (!ecoCategoryTags || !ecoCategoryTags.length) return null;

    var bestCategory = null;
    var bestFee = 0;

    for (var i = 0; i < ecoCategoryTags.length; i += 1) {
      var tagState = ecoCategoryTags[i];
      if (!tagState.hasTag) continue;

      var normalizedCategory = TAG_CATEGORY_MAP[tagState.tag];
      if (!normalizedCategory) continue;

      var fee = feeByCategory[normalizedCategory];
      if (typeof fee !== "number") continue;

      if (fee > bestFee) {
        bestFee = fee;
        bestCategory = normalizedCategory;
      }
    }

    if (!bestCategory || bestFee <= 0) {
      return null;
    }

    return {
      category: bestCategory,
      fee: bestFee
    };
  }

  async function resolveMerchandiseFeeRequirement(line, province, variantMap, feeByCategory) {
  var resolvedTags = await resolveTagsForMerchandiseLine(line);

  var resolved = resolveHighestFeeCategoryFromTags(
    toTagStates(resolvedTags),
    feeByCategory
  );

  if (!resolved) {
    log("No eco fee category resolved for merchandise line:", {
      title: line && line.title,
      handle: line && line.handle,
      tags: resolvedTags
    });
    return null;
  }

  var provinceMap = variantMap[province];
  if (!provinceMap) return null;

  var entry = provinceMap[resolved.category];
  if (!entry) {
    log("No variant map entry found for resolved category:", {
      province: province,
      category: resolved.category
    });
    return null;
  }

  return {
    province: province,
    category: resolved.category,
    variantId: entry.variantId,
    quantity: line.quantity,
    title: entry.title
  };
}

  function makeFeeKey(province, category) {
    return province + "::" + category;
  }

  function groupRequiredFeeLines(feeLines) {
    var grouped = {};

    for (var i = 0; i < feeLines.length; i += 1) {
      var line = feeLines[i];
      var key = makeFeeKey(line.province, line.category);

      if (!grouped[key]) {
        grouped[key] = {
          province: line.province,
          category: line.category,
          variantId: line.variantId,
          quantity: line.quantity,
          title: line.title
        };
      } else {
        grouped[key].quantity += line.quantity;
      }
    }

    return grouped;
  }

  async function buildRequiredFeeState(merchandiseLines, province, variantMap, feeByCategory) {
  var rawRequired = [];

  for (var i = 0; i < merchandiseLines.length; i += 1) {
    var resolved = await resolveMerchandiseFeeRequirement(
      merchandiseLines[i],
      province,
      variantMap,
      feeByCategory
    );

    if (resolved) {
      rawRequired.push(resolved);
    }
  }

  return groupRequiredFeeLines(rawRequired);
}

  function buildExistingFeeState(cartLines, feeProductId, variantMap) {
    var existing = {};

    for (var i = 0; i < cartLines.length; i += 1) {
      var line = cartLines[i];
      if (!isSynoraiFeeLine(line, feeProductId, variantMap)) continue;
      if (!line.key) continue;

      var gidVariantId = numericVariantIdToGid(line.variant_id || null);
      if (!gidVariantId) continue;

      var matched = getVariantMapEntryByVariantId(variantMap, gidVariantId);
      if (!matched) continue;

      var feeKey = makeFeeKey(matched.province, matched.category);

      existing[feeKey] = {
        key: line.key,
        quantity: line.quantity,
        province: matched.province,
        category: matched.category,
        variantId: matched.entry.variantId,
        title: matched.entry.title
      };
    }

    return existing;
  }

  function diffFeeStates(required, existing) {
    var toAdd = [];
    var toUpdate = [];
    var toRemove = [];

    var requiredKeys = Object.keys(required);
    for (var i = 0; i < requiredKeys.length; i += 1) {
      var feeKey = requiredKeys[i];
      var requiredLine = required[feeKey];
      var existingLine = existing[feeKey];

      if (!existingLine) {
        toAdd.push(requiredLine);
        continue;
      }

      if (existingLine.quantity !== requiredLine.quantity) {
        toUpdate.push({
          key: existingLine.key,
          quantity: requiredLine.quantity,
          province: requiredLine.province,
          category: requiredLine.category,
          variantId: requiredLine.variantId,
          title: requiredLine.title
        });
      }
    }

    var existingKeys = Object.keys(existing);
    for (var j = 0; j < existingKeys.length; j += 1) {
      var existingKey = existingKeys[j];
      var existingLine2 = existing[existingKey];

      if (!required[existingKey]) {
        toRemove.push(existingLine2);
      }
    }

    return {
      toAdd: toAdd,
      toUpdate: toUpdate,
      toRemove: toRemove
    };
  }

  async function buildStandardCartSyncPlan(input) {
  var parsed = parseStandardCart(
    input.items,
    input.feeProductId,
    input.variantMap
  );

  var requiredState = await buildRequiredFeeState(
    parsed.merchandiseLines,
    input.province,
    input.variantMap,
    input.feeByCategory
  );

  var existingState = buildExistingFeeState(
    parsed.feeLines,
    input.feeProductId,
    input.variantMap
  );

  var diff = diffFeeStates(requiredState, existingState);

  return {
    merchandiseCount: parsed.merchandiseLines.length,
    feeLineCount: parsed.feeLines.length,
    requiredFeeLineCount: Object.keys(requiredState).length,
    existingFeeLineCount: Object.keys(existingState).length,
    diff: diff
  };
}

  function buildFeeLineProperties(province, category) {
    return {
      _synorai_fee: "true",
      _synorai_province: province,
      _synorai_category: category
    };
  }

  async function runStandardFeeCartSync(input) {
    try {
      var provinceConfig = PROVINCE_CONFIG[input.province];
      if (!provinceConfig || !provinceConfig.enabled) {
        return {
          ok: false,
          error: "Province " + input.province + " is not enabled."
        };
      }

      var cart = await getAjaxCart();
      var items = Array.isArray(cart.items) ? cart.items : [];

      var plan = await buildStandardCartSyncPlan({
  items: items,
  province: input.province,
  feeProductId: input.feeProductId,
  variantMap: input.variantMap,
  feeByCategory: provinceConfig.feeByCategory
});

      log("Standard fee sync plan:", plan);

      for (var i = 0; i < plan.diff.toRemove.length; i += 1) {
        await removeAjaxCartLine(plan.diff.toRemove[i].key);
      }

      for (var j = 0; j < plan.diff.toUpdate.length; j += 1) {
        await changeAjaxCartLineQuantity(
          plan.diff.toUpdate[j].key,
          plan.diff.toUpdate[j].quantity
        );
      }

      for (var k = 0; k < plan.diff.toAdd.length; k += 1) {
        var line = plan.diff.toAdd[k];
        await addAjaxCartItem({
          variantId: line.variantId,
          quantity: line.quantity,
          properties: buildFeeLineProperties(line.province, line.category)
        });
      }

      var finalCart = await getAjaxCart();

      return {
        ok: true,
        plan: plan,
        cart: finalCart
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown cart sync error."
      };
    }
  }

  async function bootstrapStandardFeeStorefrontSync() {
    var config = getBootstrapConfig();

    if (!config.ok) {
      log("Bootstrap skipped:", config.error);
      return { ok: false, error: config.error };
    }

    log("Running Standard fee sync with config:", {
      province: config.province,
      feeProductId: config.feeProductId,
      hasVariantMap: !!config.variantMap
    });

    var result = await runStandardFeeCartSync({
      province: config.province,
      feeProductId: config.feeProductId,
      variantMap: config.variantMap
    });

    log("Standard fee sync result:", result);
    return result;
  }

  var config = readConfig();
  if (!config) return;

  config.variantMap = normalizeVariantMap(config);

  window.SynoraiEcoChargeConfig = config;
  window.__SynoraiEcoChargeDebug = !!config.debug;
  window.SynoraiRunStandardFeeSync = bootstrapStandardFeeStorefrontSync;

  log("Standard storefront config loaded.", config);

  if (!config.variantMap) {
    console.error("[Synorai EcoCharge] No usable variant map found in storefront config.", config);
    return;
  }

  if (config.autoRun) {
    log("Auto-running Standard fee sync...");
    Promise.resolve(window.SynoraiRunStandardFeeSync()).catch(function (error) {
      console.error("[Synorai EcoCharge] Standard fee sync failed.", error);
    });
    return;
  }

  log("Standard fee runner registered, waiting for manual trigger.");
})();