/*
 * calculo.js — Funciones puras de cálculo eléctrico RIC (SEC, Chile)
 * Portado de la planilla calculos_electricos_RIC_1.xlsx (TEC Ingeniería).
 *
 * Sin dependencias y sin acceso al DOM: cada función recibe sus datos de
 * entrada y el objeto de tablas normativas (tablas_ric.json ya parseado) y
 * devuelve un objeto plano con los resultados. Se puede testear aislado
 * (browser o Node).
 *
 * Fórmulas y referencias de celda documentadas frente a la hoja original.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CalculoRIC = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Utilidades internas
  // ---------------------------------------------------------------------------

  /** Índice de una columna por nombre dentro de una tabla {columnas, filas}. */
  function colIdx(tabla, nombre) {
    var i = tabla.columnas.indexOf(nombre);
    if (i < 0) throw new Error('Columna no encontrada: ' + nombre);
    return i;
  }

  /**
   * Equivalente a INDEX(col_resultado, MATCH(clave, col_busqueda, 0)):
   * coincidencia EXACTA. Devuelve `noMatch` si no hay fila.
   * Compara números con tolerancia y strings tras trim.
   */
  function matchExacto(filas, colBusqueda, clave, colResultado, noMatch) {
    for (var i = 0; i < filas.length; i++) {
      var v = filas[i][colBusqueda];
      var igual = (typeof v === 'number' && typeof clave === 'number')
        ? Math.abs(v - clave) < 1e-9
        : String(v).trim() === String(clave).trim();
      if (igual) return filas[i][colResultado];
    }
    return noMatch === undefined ? null : noMatch;
  }

  /**
   * Equivalente a VLOOKUP(clave, tabla, colResultado, TRUE) — coincidencia
   * aproximada sobre una primera columna ordenada ascendente: devuelve el
   * valor de la última fila cuya primera columna es <= clave.
   */
  function vlookupAprox(filas, clave, colResultado) {
    var res = null;
    for (var i = 0; i < filas.length; i++) {
      if (filas[i][0] <= clave) res = filas[i][colResultado];
      else break;
    }
    return res;
  }

  function esNumeroFinito(x) {
    return typeof x === 'number' && isFinite(x);
  }

  // ---------------------------------------------------------------------------
  // 1) Caída de tensión (hoja "Caida_Tension")
  // ---------------------------------------------------------------------------
  //
  //  V   (B18) = IF(Vpers<>"", Vpers, IF(mono, 220, 380))
  //  I   (B19) = IF(I<>"", I, IF(P<>"", P/((mono?1:√3)*V*cosφ), "—"))
  //  R   (B20) = Cobre  -> Tabla 4.1 col {sólido | concéntrico/comprimido | flexible}
  //              Aluminio genérico -> ρ_Al / sección * 1000
  //              Preensamblado aluminio -> Tabla ENERLUX col "r fase"
  //  ΔV  (B23) = (mono?2:√3) * (L/1000) * R * I * cosφ
  //  ΔV% (B24) = ΔV / V
  //  ΔV% total (B25) = ΔV% + caídaAcumuladaArriba/100
  //  cumple tramo (B26) = ΔV% <= 0.03   (RIC N°03, 5.1)
  //  cumple total (B27) = ΔV% total <= 0.05
  //
  function caidaTension(entrada, tablas) {
    var e = entrada || {};
    var esMono = (e.sistema || 'Monofásico') === 'Monofásico';
    var cosPhi = num(e.cosPhi);

    // Tensión nominal usada
    var V = esNumeroFinito(num(e.Vpersonalizada))
      ? num(e.Vpersonalizada)
      : (esMono ? 220 : 380);

    // Corriente usada en el cálculo
    var I;
    var fuenteCorriente;
    if (esNumeroFinito(num(e.I))) {
      I = num(e.I);
      fuenteCorriente = 'ingresada';
    } else if (esNumeroFinito(num(e.P))) {
      I = num(e.P) / ((esMono ? 1 : Math.sqrt(3)) * V * cosPhi);
      fuenteCorriente = 'derivada de P';
    } else {
      return { error: 'Ingresa la corriente de diseño I, o la potencia activa P.' };
    }

    // Resistencia del conductor R [Ω/km]
    var t41 = tablas.tabla_4_1_resistencia_cc_20c;
    var material = e.material || 'Cobre';
    var R, notaR = null, ampacidadPreensamblado = null, cumpleAmpacidadCable = null;

    if (material === 'Cobre') {
      var col;
      if (e.tipoConstructivo === 'Sólido') col = colIdx(t41, 'r_solido');
      else if (e.tipoConstructivo === 'Concéntrico o compacto') col = colIdx(t41, 'r_concentrico_comprimido');
      else col = colIdx(t41, 'r_flexible');
      R = matchExacto(t41.filas, colIdx(t41, 'seccion_mm2'), num(e.seccion_mm2), col, null);
      if (R === null || R === undefined) {
        return { error: 'Sección ' + e.seccion_mm2 + ' mm² no está en la Tabla N°4.1 para ese tipo constructivo.' };
      }
    } else if (material === 'Aluminio genérico') {
      var rhoAl = matchExacto(
        tablas.resistividad_material_20c.filas, 0, 'Aluminio', 1, null);
      var s = num(e.seccion_mm2);
      if (!esNumeroFinito(s) || s <= 0) return { error: 'Ingresa una sección válida para el aluminio genérico.' };
      R = rhoAl / s * 1000;
      notaR = 'R calculada como ρ_Al / sección × 1000 (aproximación IEC 60228 / UNE 21096, no tabulada por SEC).';
    } else if (material === 'Preensamblado aluminio') {
      var cat = tablas.cable_preensamblado_aluminio_enerlux_imersa;
      R = matchExacto(cat.filas, colIdx(cat, 'medida'), e.refPreensamblado,
        colIdx(cat, 'r_fase_ohm_km'), 'Ref. no encontrada');
      if (R === 'Ref. no encontrada') return { error: 'Referencia de cable preensamblado no encontrada en el catálogo.' };
      ampacidadPreensamblado = matchExacto(cat.filas, colIdx(cat, 'medida'),
        e.refPreensamblado, colIdx(cat, 'i_admisible_fase_a'), null);
      if (esNumeroFinito(ampacidadPreensamblado)) {
        cumpleAmpacidadCable = I <= ampacidadPreensamblado;
      }
      notaR = 'R y ampacidad tomadas del catálogo comercial ENERLUX / IMERSA Chile (dato de fabricante, no del RIC).';
    } else {
      return { error: 'Material de conductor no reconocido: ' + material };
    }

    // Caída de tensión
    var k = esMono ? 2 : Math.sqrt(3);
    var deltaV = k * (num(e.L_m) / 1000) * R * I * cosPhi;
    var deltaVpct = deltaV / V;                                   // fracción (0.03 == 3%)
    var acumArriba = esNumeroFinito(num(e.caidaAcumuladaArriba_pct)) ? num(e.caidaAcumuladaArriba_pct) : 0;
    var deltaVtotalPct = deltaVpct + acumArriba / 100;

    var limTramo = tablas.limites_caida_tension.caida_max_alimentador_subalimentador; // 0.03
    var limTotal = tablas.limites_caida_tension.caida_max_total_punto_mas_desfavorable; // 0.05

    return {
      V: V,
      I: I,
      fuenteCorriente: fuenteCorriente,
      R_ohm_km: R,
      notaR: notaR,
      ampacidadPreensamblado_A: ampacidadPreensamblado,
      cumpleAmpacidadCable: cumpleAmpacidadCable,
      deltaV_V: deltaV,
      deltaV_pct: deltaVpct * 100,          // en porcentaje legible
      deltaV_total_pct: deltaVtotalPct * 100,
      cumpleTramo: deltaVpct <= limTramo,
      cumpleTotal: deltaVtotalPct <= limTotal,
      limiteTramo_pct: limTramo * 100,
      limiteTotal_pct: limTotal * 100,
      formula: esMono
        ? 'ΔV = 2·L·R·I·cosφ  (L en km)'
        : 'ΔV = √3·L·R·I·cosφ  (L en km)'
    };
  }

  // ---------------------------------------------------------------------------
  // 2) Selección de conductor por ampacidad (hoja "Seleccion_Conductor")
  // ---------------------------------------------------------------------------
  //
  //  fn (B13) = VLOOKUP(nConductores, Tabla 4.6, 3, TRUE)
  //  ft (B14) = VLOOKUP(tempAmb, Tabla 4.7, col, TRUE)
  //             col = familia 70°C -> ft_70c ; método D1/D2 -> ft_90c_subt ; resto -> ft_90c
  //  It base por sección = INDEX(fila familia, MATCH(método, cabeceras, 0))
  //  Ic corregida = It · fn · ft
  //  Sección mín. por ampacidad (B19) = primera sección cuya Ic corregida >= I_diseño
  //             (Excel: INDEX(secciones, COUNTIF(Ic, "<"&I)+1))
  //  Sección mín. normativa (B20) = VLOOKUP(tipoCircuito, Tabla 5.4, 2, FALSE)  [exacta]
  //  SECCIÓN A UTILIZAR (B21) = MAX(B19, B20)
  //
  function seleccionConductor(entrada, tablas) {
    var e = entrada || {};
    var I = num(e.I_diseno);
    var familia = e.familia || '90°C';
    var metodo = e.metodo || 'A1';
    var nConductores = num(e.nConductores);
    var tempAmb = num(e.tempAmbiente);
    var tipoCircuito = e.tipoCircuito;

    if (!esNumeroFinito(I) || I <= 0) return { error: 'Ingresa una corriente de diseño I válida.' };

    // fn — Tabla 4.6 (aproximada sobre "cantidad_minima")
    var fn = vlookupAprox(tablas.tabla_4_6_fn.filas, nConductores, 2);
    if (fn === null) return { error: 'Cantidad de conductores fuera de rango de la Tabla N°4.6.' };

    // ft — Tabla 4.7 (aproximada sobre "temp_minima_c")
    var t47 = tablas.tabla_4_7_ft;
    var colFt;
    if (familia === '70°C') colFt = colIdx(t47, 'ft_70c_A1_B1_E');
    else if (metodo === 'D1' || metodo === 'D2') colFt = colIdx(t47, 'ft_90c_D1_D2_subterraneo');
    else colFt = colIdx(t47, 'ft_90c_A1_A2_B1_B2_E');
    var ft = vlookupAprox(t47.filas, tempAmb, colFt);
    if (ft === null) return { error: 'Temperatura ambiente fuera de rango de la Tabla N°4.7 (5–60 °C).' };

    // Tabla de ampacidad base según familia
    var tablaAmp = familia === '70°C'
      ? tablas.tabla_4_4_70c_ampacidad
      : tablas.tabla_4_4_90c_ampacidad;
    var tabla90 = tablas.tabla_4_4_90c_ampacidad; // ladder de secciones (igual que la planilla)

    if (tablaAmp.columnas.indexOf(metodo) < 0) {
      return {
        error: 'El método "' + metodo + '" no tiene datos para la familia ' + familia +
          '. La familia 70°C solo cubre A1, B1 y E.',
        fn: fn, ft: ft
      };
    }
    var colMetodo = tablaAmp.columnas.indexOf(metodo);

    // Escalera de secciones + Ic corregida
    var ladder = [];
    for (var i = 0; i < tabla90.filas.length; i++) {
      var seccion = tabla90.filas[i][0];
      var itBase = tablaAmp.filas[i][colMetodo];
      if (!esNumeroFinito(itBase)) continue;
      ladder.push({ seccion_mm2: seccion, it_base_A: itBase, ic_corregida_A: itBase * fn * ft });
    }

    var elegidaAmpacidad = null;
    for (var j = 0; j < ladder.length; j++) {
      if (ladder[j].ic_corregida_A >= I) { elegidaAmpacidad = ladder[j].seccion_mm2; break; }
    }

    // Sección mínima normativa por tipo de circuito (exacta)
    var seccionNormativa = null;
    if (tipoCircuito) {
      seccionNormativa = matchExacto(
        tablas.seccion_minima_por_circuito.filas, 0, tipoCircuito, 1, null);
    }

    var seccionAUtilizar = null;
    if (elegidaAmpacidad !== null && seccionNormativa !== null)
      seccionAUtilizar = Math.max(elegidaAmpacidad, seccionNormativa);
    else if (elegidaAmpacidad !== null)
      seccionAUtilizar = elegidaAmpacidad;
    else if (seccionNormativa !== null)
      seccionAUtilizar = seccionNormativa;

    return {
      fn: fn,
      ft: ft,
      formulaCorreccion: 'Ic = It × fn × ft  (RIC N°04, 6.2.6)',
      seccionMinimaAmpacidad_mm2: elegidaAmpacidad,
      seccionMinimaNormativa_mm2: seccionNormativa,
      seccionAUtilizar_mm2: seccionAUtilizar,
      excedeTabla: elegidaAmpacidad === null,
      escalera: ladder
    };
  }

  // ---------------------------------------------------------------------------
  // 3) Potencia / Corriente / Voltaje (hoja "Potencia_Corriente_Voltaje")
  // ---------------------------------------------------------------------------
  //
  //  φ (B12) = DEGREES(ACOS(cosφ))
  //  sen(φ) (B13) = SIN(RADIANS(φ))
  //  I (B14) = IF(P<>"", P/((mono?1:√3)·V·cosφ), IF(I<>"", I, "—"))
  //  S (B15) = (mono?1:√3)·V·I
  //  P (B16) = S·cosφ
  //  Q (B17) = S·sen(φ)
  //
  function potenciaCorrienteVoltaje(entrada, tablas) {
    var e = entrada || {};
    var esMono = (e.sistema || 'Monofásico') === 'Monofásico';
    var V = num(e.V);
    var cosPhi = num(e.cosPhi);
    var k = esMono ? 1 : Math.sqrt(3);

    if (!esNumeroFinito(V) || V <= 0) return { error: 'Ingresa una tensión V válida.' };
    if (!esNumeroFinito(cosPhi) || cosPhi <= 0 || cosPhi > 1) return { error: 'El factor de potencia debe estar entre 0 y 1.' };

    var phiRad = Math.acos(cosPhi);
    var phiDeg = phiRad * 180 / Math.PI;
    var senPhi = Math.sin(phiDeg * Math.PI / 180);

    var I, fuenteCorriente;
    if (esNumeroFinito(num(e.P))) {
      I = num(e.P) / (k * V * cosPhi);
      fuenteCorriente = 'derivada de P';
    } else if (esNumeroFinito(num(e.I))) {
      I = num(e.I);
      fuenteCorriente = 'ingresada';
    } else {
      return { error: 'Completa la corriente I o la potencia activa P (no ambas).' };
    }

    var S = k * V * I;
    var P = S * cosPhi;
    var Q = S * senPhi;

    return {
      phi_grados: phiDeg,
      senPhi: senPhi,
      I_A: I,
      fuenteCorriente: fuenteCorriente,
      S_VA: S,
      P_W: P,
      Q_VAR: Q,
      formula: esMono ? 'S = V·I ; P = S·cosφ ; Q = S·senφ'
                      : 'S = √3·V·I ; P = S·cosφ ; Q = S·senφ'
    };
  }

  // ---------------------------------------------------------------------------
  // Coerción de entrada: acepta number, string con coma o punto, o vacío.
  // ---------------------------------------------------------------------------
  function num(x) {
    if (x === null || x === undefined || x === '') return NaN;
    if (typeof x === 'number') return x;
    return parseFloat(String(x).replace(',', '.').trim());
  }

  return {
    caidaTension: caidaTension,
    seleccionConductor: seleccionConductor,
    potenciaCorrienteVoltaje: potenciaCorrienteVoltaje,
    _internos: { matchExacto: matchExacto, vlookupAprox: vlookupAprox, num: num }
  };
});
