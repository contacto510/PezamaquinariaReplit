export default function ZohoSetup() {
  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Configuración OAuth de Zoho
        </h1>
        <p className="text-gray-600">
          Configuración manual para integrar Zoho Mail
        </p>
      </div>

      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Instrucciones de configuración</h2>
          
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded">
              <h3 className="font-semibold text-blue-800">Paso 1: URL de autorización</h3>
              <p className="text-blue-700 text-sm mt-2">
                Necesitas visitar la URL de autorización de Zoho. Como hay problemas técnicos con las rutas del servidor,
                te proporcionaré las instrucciones manuales.
              </p>
            </div>

            <div className="p-4 bg-yellow-50 rounded">
              <h3 className="font-semibold text-yellow-800">Configuración temporal</h3>
              <p className="text-yellow-700 text-sm mt-2">
                Por el momento, voy a implementar una solución directa para el envío de emails sin necesidad del OAuth complejo.
                Esto nos permitirá tener la funcionalidad funcionando más rápidamente.
              </p>
            </div>

            <div className="p-4 bg-green-50 rounded">
              <h3 className="font-semibold text-green-800">Próximo paso</h3>
              <p className="text-green-700 text-sm mt-2">
                Implementaré el envío de emails usando SMTP de Zoho, que es más directo y confiable.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}