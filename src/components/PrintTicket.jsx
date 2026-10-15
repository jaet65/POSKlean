import { Droplet } from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { formatOtherUnits } from '../utils/volume';

export default function PrintTicket({ ticket, receiptWidth, stores }) {
  if (!ticket) return null;

  const { type, data } = ticket;
  const countLines = (field) => data.lines.filter((line) => Number(line[field]) > 0).length;
  const shortageLabel = type === 'audit' ? countLines('shortage') : '';
  const surplusLabel = type === 'audit' ? countLines('surplus') : '';

  return (
    <section
      className={`print-ticket receipt-${receiptWidth}`}
      aria-label={`Ticket de ${type === 'sale' ? 'venta' : type === 'audit' ? 'auditoría' : 'cierre'} para imprimir`}
    >
      <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        <Droplet size={20} strokeWidth={2.5} aria-hidden="true" />
        NovaKlean
      </h1>

      {type === 'sale' && (
        <>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Ticket: </span>
          <span>{data.ticketId}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Fecha: </span>
          <span>{data.timestamp}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Canal: </span>
          <span>{data.channel}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Pago: </span>
          <span>{data.paymentMethod === 'cash' ? 'Efectivo'
            : data.paymentMethod === 'card' ? 'Tarjeta'
              : data.paymentMethod === 'transfer' ? 'Transferencia'
                : 'No registrado'}</span>
        </div>
          <hr />
          {data.items.map((item) => (
            <div className="receipt-item" key={item.productId || item.name}>
              <span>{item.name}</span>
              <span>{item.qty} {item.unit || 'L'} × {formatCurrency(item.price)} MXN</span>
              <strong>{formatCurrency(item.total)} MXN</strong>
            </div>
          ))}
          <hr />
          <p>Artículos: {data.items.length}</p>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>Total:</span>
            <span>{formatCurrency(data.total)} MXN</span>
          </div>
          <hr />
          <p className="receipt-thanks">¡Gracias por su compra!</p>
          <hr />
        </>
      )}

      {type === 'audit' && (
        <>
          <p className="receipt-thanks"><strong>AUDITORÍA DE INVENTARIO</strong></p>
          <hr style={{ border: 'none', borderTop: '1px dashed #000' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tienda:</span>
              <strong>{stores.find((store) => store.id === data.storeId)?.name || data.storeId || '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Ticket:</span>
              <strong>{data.ticketId}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Fecha:</span>
              <strong>{data.timestamp}</strong>
            </div>
            <span>Usuario:</span>
            <strong>{data.createdBy?.userName || 'Desconocido'}</strong>
         </div>
          <hr style={{ border: 'none', borderTop: '1px dashed #000' }} />

          <p style={{ textAlign: 'center' }}><strong>Detalle de la auditoría</strong></p>

          {data.lines.map((line) => (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent:'space-between' }} className="receipt-item" key={line.productId}>
              <span><strong>{line.productName}</strong></span>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Esperado: </span>
                <span>{line.expectedStock.toFixed(2)} {line.unit}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Conteo: </span>
                <span>{line.countedStock.toFixed(2)} {line.unit}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Diferencia: </span>
                <span><strong>{line.difference > 0 ? '+' : ''}{line.difference.toFixed(2)} {line.unit}</strong></span>
              </div>
            </div>
          ))}
          <hr />
          <div style={{ display: 'flex', justifyContent: 'center', fontWeight: 'bold' }}>
            <span>Resumen:</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Contados: </span>
            <span>{data.auditedProducts}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Ajustados: </span>
            <span>{data.adjustedProducts}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Faltante: </span>
            <span>{shortageLabel}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Sobrante: </span>
            <span>{surplusLabel}</span>
          </div>  
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Pérdida: </span>
            <span>-{formatCurrency(data.lossValue)} MXN</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Valor: </span>
            <span>{formatCurrency(data.surplusValue)} MXN</span>
          </div>
          <hr style={{ border: 'none', borderTop: '1px dashed #000' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>Balance:</span>
            <span>{formatCurrency(data.surplusValue - data.lossValue)} MXN</span>
          </div>
          <hr style={{ border: 'none', borderTop: '1px dashed #000' }} />
          <div style={{ display: 'flex', justifyContent: 'center', fontWeight: 'bold' }}>
            <span>Fin del reporte</span>
          </div>
          <hr style={{ border: 'none', borderTop: '1px dashed #000' }} />

        </>
      )}
      

      {type === 'cashClosure' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', fontWeight: 'bold' }}>
            <span>RESUMEN DE VENTAS</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Fecha:</span>
            <span>{data.date}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Hora:</span>
            <span>{data.closedAt}</span>
          </div>
          <p>Responsable: </p>
          <strong>{data.closedBy}</strong>
          <hr />
          <div className="receipt-item"><span>Tickets</span><strong>{data.tickets}</strong></div>
          <div className="receipt-item"><span>Litros despachados</span><strong>{data.liters.toFixed(2)} L</strong></div>
          {data.others?.length > 0 && (
            <div className="receipt-item"><span>Otros</span><strong>{formatOtherUnits(data.others)}</strong></div>
          )}
          <hr />
          <p><strong>Ventas por canal</strong></p>
          {data.channels.map(({ channel, tickets, total }) => (
            <div className="receipt-item" key={channel}>
              <span>{channel} ({tickets})</span>
              <strong>{formatCurrency(total)} MXN</strong>
            </div>
          ))}
          <hr />
          <p><strong>Ventas por tienda</strong></p>
          {data.stores.map(({ storeId, tickets, total }) => (
            <div className="receipt-item" key={storeId || 'no-store'}>
              <span>{stores.find((store) => store.id === storeId)?.name || storeId || 'Sin tienda'} ({tickets})</span>
              <strong>{formatCurrency(total)} MXN</strong>
            </div>
          ))}
          <hr />
          <p><strong>Ventas por producto</strong></p>
          {data.products.map(({ key, name, unit, quantity, total }) => (
            <div className="receipt-item" key={key}>
              <span>{name} · {quantity.toFixed(2)} {unit}</span>
              <strong>{formatCurrency(total)} MXN</strong>
            </div>
          ))}
          <hr />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }} className="receipt-total">
            <span>TOTAL: </span>
            <span>{formatCurrency(data.total)} MXN</span>
          </div>
          <hr style={{ border: 'none', borderTop: '1px dashed #000' }} />
          <div style={{ display: 'flex', justifyContent: 'center', fontWeight: 'bold' }}>
            <span>Fin del reporte</span>
          </div>
          <hr style={{ border: 'none', borderTop: '1px dashed #000' }} />

        </>
      )}

      {type === 'cashShift' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', fontWeight: 'bold' }}>
            <span>CIERRE DE TURNO</span>
          </div>
          <div className="receipt-item"><span>Tienda</span><strong>{data.storeName || data.storeId}</strong></div>
          <div className="receipt-item"><span>Turno</span><strong>{data.id.slice(0, 8).toUpperCase()}</strong></div>
          <div className="receipt-item"><span>Cajero</span><strong>{data.closedBy?.userName || data.openedBy?.userName || 'Desconocido'}</strong></div>
          <div className="receipt-item"><span>Cierre</span><strong>{data.timestamp || 'Fecha no disponible'}</strong></div>
          <hr />
          <div className="receipt-item"><span>Tickets</span><strong>{data.saleCount ?? 0}</strong></div>
          <div className="receipt-item"><span>Fondo inicial</span><strong>{formatCurrency(data.openingCashCents / 100)} MXN</strong></div>
          <div className="receipt-item"><span>Ventas en efectivo</span><strong>{formatCurrency((data.paymentTotalsCents?.cash || 0) / 100)} MXN</strong></div>
          <div className="receipt-item"><span>Ventas con tarjeta</span><strong>{formatCurrency((data.paymentTotalsCents?.card || 0) / 100)} MXN</strong></div>
          <div className="receipt-item"><span>Ventas por transferencia</span><strong>{formatCurrency((data.paymentTotalsCents?.transfer || 0) / 100)} MXN</strong></div>
          <hr />
          <div className="receipt-item"><span>Efectivo esperado</span><strong>{formatCurrency(data.expectedCashCents / 100)} MXN</strong></div>
          <div className="receipt-item"><span>Efectivo contado</span><strong>{formatCurrency(data.countedCashCents / 100)} MXN</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }} className="receipt-total">
            <span>Diferencia</span>
            <span>{formatCurrency(data.cashDifferenceCents / 100)} MXN</span>
          </div>
          <hr style={{ border: 'none', borderTop: '1px dashed #000' }} />
          <p style={{ textAlign: 'center' }}>Cierre registrado por {data.closedBy?.userName || 'Desconocido'}</p>
        </>
      )}

      <p style={{ textAlign: 'center', fontSize: '0.7em' }}>Printed by POSKlean</p>
    </section>
  );
}
