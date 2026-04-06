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
      console.error(
        "[Synorai EcoCharge] Failed to parse standard config JSON.",
        error,
        el.textContent,
      );
      return null;
    }
  }

  function log() {
    if (!window.__SynoraiEcoChargeDebug) return;
    console.log.apply(
      console,
      ["[Synorai EcoCharge]"].concat(Array.prototype.slice.call(arguments)),
    );
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
        tools: 0.65,
      },
    },
    BC: {
      enabled: true,
      label: "BC Environmental Fee",
      feeByCategory: {
        computers: 0.70,
        laptops: 0.45,
        printers: 6.5,
        peripherals: 0.35,
        av: 2.8,
        cellphones: 0.2,
        "display-small": 3.5,
        "display-large": 4.5,
        "display-xlarge": 7.75,
        "all-in-one": 3.5,
        "small-appliances": 0,
        tools: 0,
      },
    },
    SK: {
      enabled: true,
      label: "SK Environmental Fee",
      feeByCategory: {
        computers: 0.8,
        laptops: 0.45,
        printers: 4.5,
        peripherals: 0.2,
        av: 1.25,
        cellphones: 0,
        "display-small": 1.8,
        "display-large": 3.1,
        "display-xlarge": 7,
        "all-in-one": 1.8,
        "small-appliances": 0,
        tools: 0,
      },
    },
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
    "eco-category-tools": "tools",
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
        console.error(
          "[Synorai EcoCharge] Failed to parse variantMapJson string.",
          error,
          config.variantMapJson,
        );
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
      typeof config.feeProductId === "string" &&
      config.feeProductId.trim().length > 0
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
      autoRun: !!config.autoRun,
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
        (data &&
          typeof data === "object" &&
          typeof data.description === "string" &&
          data.description) ||
        (data &&
          typeof data === "object" &&
          typeof data.message === "string" &&
          data.message) ||
        "Cart request failed with status " + response.status;

      throw new Error(message);
    }

    return data;
  }

  async function getAjaxCart() {
    var response = await fetch("/cart.js", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });

    return parseJsonResponse(response);
  }

  async function addAjaxCartItem(input) {
    var numericVariantId = extractNumericVariantId(input.variantId);

    var response = await fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        items: [
          {
            id: numericVariantId,
            quantity: input.quantity,
            properties: input.properties || {},
          },
        ],
      }),
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
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        id: lineKey,
        quantity: quantity,
      }),
    });

    return parseJsonResponse(response);
  }

  async function removeAjaxCartLine(lineKey) {
    return changeAjaxCartLineQuantity(lineKey, 0);
  }

  function normalizeTags(tags) {
    if (Array.isArray(tags)) {
      return tags
        .map(function (tag) {
          return String(tag).trim();
        })
        .filter(function (tag) {
          return tag.length > 0;
        });
    }

    if (typeof tags === "string") {
      return tags
        .split(",")
        .map(function (tag) {
          return tag.trim();
        })
        .filter(function (tag) {
          return tag.length > 0;
        });
    }

    return [];
  }

  function toCartLineLike(line) {
    return {
      key: typeof line.key === "string" ? line.key : undefined,
      quantity: typeof line.quantity === "number" ? line.quantity : 0,
      product_id:
        typeof line.product_id === "number" ? line.product_id : null,
      variant_id:
        typeof line.variant_id === "number" ? line.variant_id : null,
      title: typeof line.title === "string" ? line.title : undefined,
      properties: line.properties || null,
      product: {
        title:
          typeof line.product_title === "string"
            ? line.product_title
            : typeof line.title === "string"
              ? line.title
              : undefined,
        tags: normalizeTags(line.tags),
      },
    };
  }

  function toMerchandiseLineInput(line) {
    var key = typeof line.key === "string" ? line.key.trim() : "";
    var quantity = typeof line.quantity === "number" ? line.quantity : 0;
    var title =
      typeof line.product_title === "string" &&
      line.product_title.trim().length > 0
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
      tags: normalizeTags(line.tags),
    };
  }

  var __synoraiProductTagCache = {};

  async function getProductJsonByHandle(handle) {
    var normalizedHandle = typeof handle === "string" ? handle.trim() : "";

    if (!normalizedHandle) {
      return null;
    }

    if (__synoraiProductTagCache[normalizedHandle]) {
      return __synoraiProductTagCache[normalizedHandle];
    }

    var request = fetch(
      "/products/" + encodeURIComponent(normalizedHandle) + ".js",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      },
    )
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
      tags: resolvedTags,
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
      var matchedByVariant = getVariantMapEntryByVariantId(
        variantMap,
        gidVariantId,
      );
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
      feeLines: feeLines,
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
      fee: bestFee,
    };
  }

  async function resolveMerchandiseFeeRequirement(
    line,
    province,
    variantMap,
    feeByCategory,
  ) {
    var resolvedTags = await resolveTagsForMerchandiseLine(line);

    var resolved = resolveHighestFeeCategoryFromTags(
      toTagStates(resolvedTags),
      feeByCategory,
    );

    if (!resolved) {
      log("No eco fee category resolved for merchandise line:", {
        title: line && line.title,
        handle: line && line.handle,
        tags: resolvedTags,
      });
      return null;
    }

    var provinceMap = variantMap[province];
    if (!provinceMap) return null;

    var entry = provinceMap[resolved.category];
    if (!entry) {
      log("No variant map entry found for resolved category:", {
        province: province,
        category: resolved.category,
      });
      return null;
    }

    return {
      province: province,
      category: resolved.category,
      variantId: entry.variantId,
      quantity: line.quantity,
      title: entry.title,
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
          title: line.title,
        };
      } else {
        grouped[key].quantity += line.quantity;
      }
    }

    return grouped;
  }

  async function buildRequiredFeeState(
    merchandiseLines,
    province,
    variantMap,
    feeByCategory,
  ) {
    var rawRequired = [];

    for (var i = 0; i < merchandiseLines.length; i += 1) {
      var resolved = await resolveMerchandiseFeeRequirement(
        merchandiseLines[i],
        province,
        variantMap,
        feeByCategory,
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
        title: matched.entry.title,
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
          title: requiredLine.title,
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
      toRemove: toRemove,
    };
  }

  async function buildStandardCartSyncPlan(input) {
    var parsed = parseStandardCart(
      input.items,
      input.feeProductId,
      input.variantMap,
    );

    var requiredState = await buildRequiredFeeState(
      parsed.merchandiseLines,
      input.province,
      input.variantMap,
      input.feeByCategory,
    );

    var existingState = buildExistingFeeState(
      parsed.feeLines,
      input.feeProductId,
      input.variantMap,
    );

    var diff = diffFeeStates(requiredState, existingState);

    return {
      merchandiseCount: parsed.merchandiseLines.length,
      feeLineCount: parsed.feeLines.length,
      requiredFeeLineCount: Object.keys(requiredState).length,
      existingFeeLineCount: Object.keys(existingState).length,
      diff: diff,
    };
  }

  function buildFeeLineProperties(province, category) {
    return {
      _synorai_fee: "true",
      _synorai_province: province,
      _synorai_category: category,
    };
  }

  async function runStandardFeeCartSync(input) {
    try {
      var provinceConfig = PROVINCE_CONFIG[input.province];
      if (!provinceConfig || !provinceConfig.enabled) {
        return {
          ok: false,
          error: "Province " + input.province + " is not enabled.",
        };
      }

      var cart = await getAjaxCart();
      var items = Array.isArray(cart.items) ? cart.items : [];

      var plan = await buildStandardCartSyncPlan({
        items: items,
        province: input.province,
        feeProductId: input.feeProductId,
        variantMap: input.variantMap,
        feeByCategory: provinceConfig.feeByCategory,
      });

      log("Standard fee sync plan:", plan);

      for (var i = 0; i < plan.diff.toRemove.length; i += 1) {
        await removeAjaxCartLine(plan.diff.toRemove[i].key);
      }

      for (var j = 0; j < plan.diff.toUpdate.length; j += 1) {
        await changeAjaxCartLineQuantity(
          plan.diff.toUpdate[j].key,
          plan.diff.toUpdate[j].quantity,
        );
      }

      for (var k = 0; k < plan.diff.toAdd.length; k += 1) {
        var line = plan.diff.toAdd[k];
        await addAjaxCartItem({
          variantId: line.variantId,
          quantity: line.quantity,
          properties: buildFeeLineProperties(line.province, line.category),
        });
      }

      var finalCart = await getAjaxCart();

      return {
        ok: true,
        plan: plan,
        cart: finalCart,
      };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown cart sync error.",
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
      hasVariantMap: !!config.variantMap,
    });

    var result = await runStandardFeeCartSync({
      province: config.province,
      feeProductId: config.feeProductId,
      variantMap: config.variantMap,
    });

    log("Standard fee sync result:", result);
    return result;
  }

  var __synoraiSyncInFlight = false;
  var __synoraiSyncQueued = false;
  var __synoraiSyncTimer = null;
  var __synoraiIgnoreCartInstrumentation = 0;
  var __synoraiLastCartFingerprint = null;

  function beginInternalCartMutation() {
    __synoraiIgnoreCartInstrumentation += 1;
  }

  function endInternalCartMutation() {
    window.setTimeout(function () {
      __synoraiIgnoreCartInstrumentation = Math.max(
        0,
        __synoraiIgnoreCartInstrumentation - 1,
      );
    }, 0);
  }

  function shouldIgnoreCartInstrumentation() {
    return __synoraiIgnoreCartInstrumentation > 0;
  }

  async function getCartFingerprint() {
    try {
      var cart = await getAjaxCart();
      var items = Array.isArray(cart.items) ? cart.items : [];

      var parts = items.map(function (item) {
        var key = typeof item.key === "string" ? item.key : "";
        var quantity =
          typeof item.quantity === "number" ? String(item.quantity) : "0";
        return key + ":" + quantity;
      });

      parts.sort();
      return parts.join("|");
    } catch (error) {
      log("Failed to build cart fingerprint:", error);
      return null;
    }
  }

  async function runManagedStandardFeeSync(reason) {
    if (__synoraiSyncInFlight) {
      __synoraiSyncQueued = true;
      log("Standard fee sync already in flight, queueing rerun:", reason);
      return;
    }

    __synoraiSyncInFlight = true;

    try {
      log("Starting managed Standard fee sync. Reason:", reason);

      beginInternalCartMutation();
      var result = await bootstrapStandardFeeStorefrontSync();
      endInternalCartMutation();

      if (result && result.ok) {
        __synoraiLastCartFingerprint = await getCartFingerprint();
      }

      return result;
    } catch (error) {
      endInternalCartMutation();
      console.error("[Synorai EcoCharge] Managed Standard fee sync failed.", error);
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown managed cart sync error.",
      };
    } finally {
      __synoraiSyncInFlight = false;

      if (__synoraiSyncQueued) {
        __synoraiSyncQueued = false;
        scheduleStandardFeeSync("queued-rerun", 150);
      }
    }
  }

  function scheduleStandardFeeSync(reason, delay) {
    var waitMs = typeof delay === "number" ? delay : 250;

    if (__synoraiSyncTimer) {
      window.clearTimeout(__synoraiSyncTimer);
    }

    __synoraiSyncTimer = window.setTimeout(async function () {
      __synoraiSyncTimer = null;

      var nextFingerprint = await getCartFingerprint();

      if (
        __synoraiLastCartFingerprint &&
        nextFingerprint &&
        __synoraiLastCartFingerprint === nextFingerprint
      ) {
        log("Skipping Standard fee sync because cart fingerprint is unchanged:", {
          reason: reason,
          fingerprint: nextFingerprint,
        });
        return;
      }

      runManagedStandardFeeSync(reason);
    }, waitMs);
  }

  function isCartUrl(url) {
    if (!url) return false;

    var value = String(url);
    return (
      value.indexOf("/cart/add") !== -1 ||
      value.indexOf("/cart/change") !== -1 ||
      value.indexOf("/cart/update") !== -1 ||
      value.indexOf("/cart/clear") !== -1 ||
      value.indexOf("/cart.js") !== -1
    );
  }

  function setupFetchInstrumentation() {
    if (!window.fetch || window.__synoraiEcoChargeFetchWrapped) return;

    var originalFetch = window.fetch.bind(window);
    window.__synoraiEcoChargeFetchWrapped = true;

    window.fetch = function (input, init) {
      var url =
        typeof input === "string"
          ? input
          : input && typeof input.url === "string"
            ? input.url
            : "";

      var method =
        (init && init.method) ||
        (input && input.method) ||
        "GET";

      var shouldWatch = isCartUrl(url);
      var isIgnored = shouldIgnoreCartInstrumentation();

      return originalFetch(input, init).then(function (response) {
        if (shouldWatch && !isIgnored) {
          var normalizedMethod = String(method || "GET").toUpperCase();
          if (normalizedMethod !== "GET" || String(url).indexOf("/cart.js") === -1) {
            log("Observed cart fetch activity:", {
              url: url,
              method: normalizedMethod,
              status: response && response.status,
            });
            scheduleStandardFeeSync("fetch:" + normalizedMethod + ":" + url, 300);
          }
        }
        return response;
      });
    };
  }

  function setupXhrInstrumentation() {
    if (!window.XMLHttpRequest || window.__synoraiEcoChargeXhrWrapped) return;

    var OriginalXhr = window.XMLHttpRequest;
    window.__synoraiEcoChargeXhrWrapped = true;

    function WrappedXhr() {
      var xhr = new OriginalXhr();
      var requestUrl = "";
      var requestMethod = "GET";

      var originalOpen = xhr.open;
      xhr.open = function (method, url) {
        requestMethod = method || "GET";
        requestUrl = url || "";
        return originalOpen.apply(xhr, arguments);
      };

      xhr.addEventListener("loadend", function () {
        if (shouldIgnoreCartInstrumentation()) return;
        if (!isCartUrl(requestUrl)) return;

        var normalizedMethod = String(requestMethod || "GET").toUpperCase();
        if (normalizedMethod !== "GET" || String(requestUrl).indexOf("/cart.js") === -1) {
          log("Observed cart XHR activity:", {
            url: requestUrl,
            method: normalizedMethod,
            status: xhr.status,
          });
          scheduleStandardFeeSync("xhr:" + normalizedMethod + ":" + requestUrl, 300);
        }
      });

      return xhr;
    }

    WrappedXhr.UNSENT = OriginalXhr.UNSENT;
    WrappedXhr.OPENED = OriginalXhr.OPENED;
    WrappedXhr.HEADERS_RECEIVED = OriginalXhr.HEADERS_RECEIVED;
    WrappedXhr.LOADING = OriginalXhr.LOADING;
    WrappedXhr.DONE = OriginalXhr.DONE;

    window.XMLHttpRequest = WrappedXhr;
  }

  function setupFormSubmitListener() {
    if (window.__synoraiEcoChargeFormListenerAttached) return;
    window.__synoraiEcoChargeFormListenerAttached = true;

    document.addEventListener(
      "submit",
      function (event) {
        var form = event.target;
        if (!form || !form.getAttribute) return;

        var action = String(form.getAttribute("action") || "");
        if (action.indexOf("/cart/add") === -1) return;

        log("Observed cart add form submit.");
        scheduleStandardFeeSync("form-submit:/cart/add", 700);
      },
      true,
    );
  }

  function setupCustomEventListeners() {
    if (window.__synoraiEcoChargeEventListenersAttached) return;
    window.__synoraiEcoChargeEventListenersAttached = true;

    var events = [
      "cart:refresh",
      "cart:updated",
      "cart:change",
      "cart:build",
      "shopify:section:load",
      "shopify:section:reorder",
      "shopify:section:select",
      "shopify:section:deselect",
      "shopify:block:select",
      "shopify:block:deselect",
    ];

    events.forEach(function (eventName) {
      document.addEventListener(eventName, function () {
        if (shouldIgnoreCartInstrumentation()) return;
        log("Observed storefront event:", eventName);
        scheduleStandardFeeSync("event:" + eventName, 400);
      });
    });
  }

  function setupMutationObserver() {
    if (window.__synoraiEcoChargeMutationObserverAttached) return;
    window.__synoraiEcoChargeMutationObserverAttached = true;

    if (!window.MutationObserver || !document.body) return;

    var observer = new MutationObserver(function (mutations) {
      if (shouldIgnoreCartInstrumentation()) return;

      for (var i = 0; i < mutations.length; i += 1) {
        var mutation = mutations[i];

        if (mutation.type !== "childList") continue;
        if (
          mutation.addedNodes.length === 0 &&
          mutation.removedNodes.length === 0
        ) {
          continue;
        }

        var target = mutation.target;
        var text =
          target && target.className ? String(target.className) : "";

        if (
          text.indexOf("cart") !== -1 ||
          text.indexOf("drawer") !== -1 ||
          text.indexOf("mini-cart") !== -1 ||
          text.indexOf("ajaxcart") !== -1
        ) {
          log("Observed cart-related DOM mutation.");
          scheduleStandardFeeSync("mutation-observer", 500);
          return;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function setupStandardFeeAutoResync() {
    setupFetchInstrumentation();
    setupXhrInstrumentation();
    setupFormSubmitListener();
    setupCustomEventListeners();
    setupMutationObserver();
    log("Standard fee auto-resync listeners attached.");
  }

  var config = readConfig();
  if (!config) return;

  config.variantMap = normalizeVariantMap(config);

  window.SynoraiEcoChargeConfig = config;
  window.__SynoraiEcoChargeDebug = !!config.debug;
  window.SynoraiRunStandardFeeSync = function () {
    return runManagedStandardFeeSync("manual");
  };

  log("Standard storefront config loaded.", config);

  if (!config.variantMap) {
    console.error(
      "[Synorai EcoCharge] No usable variant map found in storefront config.",
      config,
    );
    return;
  }

  setupStandardFeeAutoResync();

  if (config.autoRun) {
    log("Auto-running Standard fee sync...");
    Promise.resolve(runManagedStandardFeeSync("startup")).catch(function (error) {
      console.error("[Synorai EcoCharge] Standard fee sync failed.", error);
    });
    return;
  }

  log("Standard fee runner registered, waiting for manual trigger.");
})();
